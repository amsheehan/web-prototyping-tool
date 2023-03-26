import { BatchChunker } from './batch-chunker.class';
import {
  FirebaseCollection,
  FirebaseCollectionType,
  FirebaseField,
  FirebaseQueryOperation,
} from 'cd-common/consts';
import { map, first, takeUntil, switchMap, retry, filter, take } from 'rxjs/operators';
import { BatchQueue, detectUndefinedObjects, RETRY_ATTEMPTS } from './database.utils';
import { Observable, Subject, from, fromEvent } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Timestamp } from 'firebase/firestore';
import { Injectable } from '@angular/core';
import {
  Firestore,
  DocumentSnapshot,
  QueryConstraint,
  DocumentData,
  doc,
  docData,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  collectionData,
  query,
  where,
  limit,
} from '@angular/fire/firestore';
import * as cd from 'cd-interfaces';
import * as dbPathUtils from './path.utils';
import * as firestore from '@angular/fire/firestore';

const ONE_BILLION = 1000000000;

/**
 * Handles the most common database operations for the app. This service is
 * used by most other services for base database access.
 */
@Injectable({
  providedIn: 'root',
})
export class DatabaseService {
  public batchQueue = new BatchQueue();
  private _disconnectProject$ = new Subject<void>();

  static getTimestamp(): Timestamp {
    return Timestamp.now();
  }

  constructor(private _afs: Firestore) {
    fromEvent<BeforeUnloadEvent>(window, 'beforeunload')
      .pipe(filter(() => this.batchQueue.active))
      .subscribe(this.handleBeforeUnload);
  }

  /**
   * Shows a native alert preventing tab / window close
   * only when there are pending batch writes
   */
  handleBeforeUnload = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = '';
  };

  async setDocument(path: string, payload: cd.CdDatabaseDocument) {
    return await addDoc(collection(this._afs, path), payload);
  }

  async updateDocument(path: string, payload: Partial<cd.CdDatabaseDocument>) {
    return await updateDoc(doc(this._afs, path), payload);
  }

  async deleteDocument(path: string): Promise<void> {
    return await deleteDoc(doc(this._afs, path));
  }

  getDocument(path: string): Observable<DocumentSnapshot<unknown>> {
    return from(getDoc(doc(this._afs, path))).pipe(retry(RETRY_ATTEMPTS), first());
  }

  getDocumentData<T>(path: string): Observable<T | undefined> {
    return this.getDocument(path).pipe(map((doc) => doc.data() as T));
  }

  getCollection(
    collectionName: FirebaseCollectionType,
    queryExpressions?: QueryConstraint[]
  ): Observable<DocumentData[]> {
    if (queryExpressions) {
      const collectionRef = collection(this._afs, collectionName);

      return collectionData(query(collectionRef, ...queryExpressions)).pipe(
        retry(RETRY_ATTEMPTS),
        first(),
        map((actions) => actions.map((a) => a.payload.doc.data() as DocumentData))
      );
    }

    return collectionData(collection(this._afs, collectionName)).pipe(
      retry(RETRY_ATTEMPTS),
      first(),
      map((actions) => actions.map((a) => a.payload.doc.data() as DocumentData))
    );
  }

  getProjectContents(projectId: string): Observable<cd.IProjectContentDocument[]> {
    return collectionData(
      query(
        collection(this._afs, FirebaseCollection.ProjectContents),
        where(FirebaseField.ProjectId, FirebaseQueryOperation.Equals, projectId)
      )
    ).pipe(
      retry(RETRY_ATTEMPTS),
      first(), // Auto unsubscribe
      map((data) => data.map((doc) => doc.data() as cd.IProjectContentDocument))
    );
  }

  getProjectBoards = (project: cd.IProject, max?: number): Observable<DocumentData[]> => {
    return collectionData(
      query(
        collection(this._afs, FirebaseCollection.ProjectContents),
        where(FirebaseField.ProjectId, FirebaseQueryOperation.Equals, project.id),
        where(
          FirebaseField.ElementType,
          FirebaseQueryOperation.Equals,
          cd.ElementEntitySubType.Board
        ),
        limit(max ?? ONE_BILLION) // Ridiculoudly high number if no max is passed
      )
    ).pipe(
      retry(RETRY_ATTEMPTS),
      first(), // Auto unsubscribe
      map((data) => data.map((doc) => doc.data() as cd.IBoardProperties))
    );
  };

  writeProjectAndContents = (project: cd.IProject, contents: cd.IProjectContentDocument[]) => {
    const projectPath = dbPathUtils.projectPathForId(project.id);
    const writeProject$ = from(this.setDocument(projectPath, project));
    const contentBatch: cd.WriteBatchPayload = new Map();
    contentBatch.set(projectPath, project);

    for (const model of contents) {
      const docPath = dbPathUtils.projectContentsPathForId(model.id);
      contentBatch.set(docPath, model as cd.CdDatabaseDocument);
    }

    // Need to write project document before writing content docs so that we adhere to firestore
    // rules. I.e. Must be owner of existing project doc in order to set contents.
    return writeProject$.pipe(switchMap(() => this.batchChanges(contentBatch)));
  };

  subscribeToProjectComments(projectId: string): Observable<DocumentData[]> {
    return collectionData(
      query(
        collection(this._afs, FirebaseCollection.Comments),
        where(FirebaseField.ProjectId, FirebaseQueryOperation.Equals, projectId)
      )
    ).pipe(takeUntil(this._disconnectProject$));

    // OLD: (state changes?)
    // const projectComments$ = this._afs
    //   .collection(FirebaseCollection.Comments, (ref) =>
    //     ref.where(FirebaseField.ProjectId, FirebaseQueryOperation.Equals, projectId)
    //   )
    //   .stateChanges()
    //   .pipe(takeUntil(this._disconnectProject$));

    // return projectComments$;
  }

  subscribeToDocument(path: string): Observable<DocumentData | undefined> {
    return docData(doc(this._afs, path));
  }

  unsubscribeProject() {
    this._disconnectProject$.next();
  }

  /**
   * @param writes Map from path to document to payload to be written to that document
   * @param deletes Set of strings that each represent the path to a document. E.g. project_contents/id
   */
  async batchChanges(writes?: cd.WriteBatchPayload, deletes?: Set<string>): Promise<void> {
    const batchChunker = new BatchChunker(this._afs);
    this.batchQueue.add(batchChunker.id);

    if (writes) {
      const writeEntries = writes.entries();

      for (const [path, payload] of writeEntries) {
        const ref = this._getDocRef(path);
        batchChunker.set(ref, payload);
        this.checkForUndefinedPayload(payload); // only used in local development
      }
    }

    if (deletes) {
      for (const path of deletes) {
        const ref = this._getDocRef(path);
        batchChunker.delete(ref);
      }
    }

    return batchChunker
      .commit()
      .catch((err) => {
        const errMsg = 'Batch Write Error';
        if (!environment.production) {
          console.error(errMsg, err);
          console.log({ writes, deletes });
        } else {
          console.warn(errMsg, err);
        }
      })
      .finally(() => this.batchQueue.remove(batchChunker.id));
  }

  writeAnalyticsEvent = async (exceptionEntry: cd.IExceptionEvent) => {
    const entryPath = dbPathUtils.exceptionsPathForId(exceptionEntry.id);
    return await this.setDocument(entryPath, exceptionEntry);
  };

  checkIfAdminUser = (user: cd.IUser): Observable<boolean> => {
    return docData(doc(this._afs, dbPathUtils.adminsPathForId(user.id))).pipe(
      map((data) => !!data.id)
    );
  };

  /**
   * Firestore cannot write undefined values, when running locally this
   * will check for undefined values, and throw an error if found.
   */
  private checkForUndefinedPayload(payload: {}) {
    if (environment.production) return;
    const hasUndefined = detectUndefinedObjects(payload);
    if (!hasUndefined) return;
    const id = (payload as any)?.id;
    // If this is caused by an action (interaction), ignore it
    console.warn(`Batch Write: Undefined in ${id} - ${JSON.stringify(payload)}`);
  }

  private _getDocRef = (path: string) => doc(this._afs, path);
}
