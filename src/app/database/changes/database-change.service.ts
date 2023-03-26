/*
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as cd from 'cd-interfaces';
import { Injectable } from '@angular/core';
import { DatabaseService } from '../database.service';
import {
  commentPathForId,
  projectContentsPathForId,
  projectPathForId,
  publishEntryPathForId,
} from '../path.utils';
import { getModels } from 'cd-common/models';
import { calcDatabaseUpdates } from '../database.utils';
import { getUser, IAppState } from 'src/app/store';
import { select, Store } from '@ngrx/store';
import { forkJoin, Observable, of, Subscription } from 'rxjs';
import { DuplicateService } from 'src/app/services/duplicate/duplicate.service';
import { map, switchMap } from 'rxjs/operators';
import { DEFAULT_PROJECT_TYPE } from 'cd-common/consts';
import { generateKeywordsForPublishEntry } from 'cd-common/utils';
import { DocumentData } from 'firebase/firestore';

/**
 * Abstraction layer for all writes to the database
 */
@Injectable({
  providedIn: 'root',
})
export class DatabaseChangesService {
  private subscriptions = new Subscription();
  private _currentUser?: cd.IUser;

  constructor(
    private databaseService: DatabaseService,
    private appStore: Store<IAppState>,
    private _duplicateService: DuplicateService
  ) {
    const user$ = this.appStore.pipe(select(getUser));
    this.subscriptions.add(user$.subscribe(this.onUserSubscription));
  }

  private onUserSubscription = (user?: cd.IUser) => {
    this._currentUser = user;
  };

  get currentUser() {
    return this._currentUser;
  }

  //#region Project changes

  /**
   * Create a project from a template
   * Returns and Observable of the id of the newly created project
   */
  createProjectFromTemplate = (
    template: cd.ILoadedTemplate,
    newOwner: cd.IUser,
    editTemplate = false
  ): Observable<string> => {
    return this._duplicateService.createProjectDuplicates(template.project, newOwner).pipe(
      switchMap(({ project, contents }) => {
        // default is duplicated project name is: "Copy of [project name]",
        // when creating from a template we don't want "Copy of",
        // so just set to original project name
        project.name = template.project.name;

        // Change type from 'Template' to 'Default' since new project is an instance of the template
        project.type = DEFAULT_PROJECT_TYPE;

        // If editTemplate, set the publishEntryId, so that new versions of the template can be
        // published from this project
        if (editTemplate) {
          const { publishEntry } = template;
          const latestVersion = publishEntry.versions[0];
          project.publishId = { entryId: publishEntry.id, versionId: latestVersion.id };
        }

        const databaseWrites$ = this.databaseService.writeProjectAndContents(project, contents);
        return forkJoin([of(project.id), databaseWrites$]);
      }),
      map(([newProjectId]) => newProjectId)
    );
  };

  /** Set a project document */

  /** Update a project */
  async updateProject(projectId: string, changes: Partial<cd.IProject>) {
    const projectPath = projectPathForId(projectId);
    const updatedAt = DatabaseService.getTimestamp();
    const update = { ...changes, updatedAt };
    return await this.databaseService.updateDocument(projectPath, update);
  }

  /** Delete a project */
  async deleteProject(projectId: string) {
    const projectPath = projectPathForId(projectId);
    return await this.databaseService.deleteDocument(projectPath);
  }

  //#endregion

  //#region Element changes

  /** Update elements */
  async updateElements(
    elementProperties: cd.ElementPropertiesMap,
    updates: cd.IPropertiesUpdatePayload[]
  ) {
    const [writes] = calcDatabaseUpdates(elementProperties, undefined, [], updates);
    return await this.databaseService.batchChanges(writes);
  }

  /** Delete elements */
  async deleteElements(
    project: cd.IProject,
    elementProperties: cd.ElementPropertiesMap,
    deletions: cd.PropertyModel[],
    updates: cd.IPropertiesUpdatePayload[] = []
  ) {
    const [writes, deletes] = calcDatabaseUpdates(elementProperties, project, deletions, updates);
    return await this.databaseService.batchChanges(writes, deletes);
  }

  /** Perfrom create, update, and delete operations together */
  async modifyElements(
    project: cd.IProject,
    elementProperties: cd.ElementPropertiesMap,
    creates: cd.PropertyModel[] = [],
    updates: cd.IPropertiesUpdatePayload[] = [],
    deletions: cd.PropertyModel[] = []
  ) {
    const allModels = [...creates, ...deletions];
    const [writes, deletes] = calcDatabaseUpdates(elementProperties, project, allModels, updates);
    return await this.databaseService.batchChanges(writes, deletes);
  }

  /** Write all elements in ElementPropertiesMap and delete all deleteIds */
  async syncAllElements(
    project: cd.IProject,
    elementProperties: cd.ElementPropertiesMap,
    deleteIds: Set<string>
  ) {
    const allModels = getModels(elementProperties);
    const [writes] = calcDatabaseUpdates(elementProperties, project, allModels);
    const deletePaths = Array.from(deleteIds).map((id) => projectContentsPathForId(id));
    const deletes = new Set(deletePaths);
    return await this.databaseService.batchChanges(writes, deletes);
  }

  //#endregion

  //#region Code component changes

  /** Create new code component */
  async createCodeComponents(codeComponents: cd.ICodeComponentDocument[]) {
    const batchPayload: cd.WriteBatchPayload = new Map();
    for (const cmp of codeComponents) {
      const path = projectContentsPathForId(cmp.id);
      batchPayload.set(path, cmp);
    }
    return await this.databaseService.batchChanges(batchPayload);
  }

  /**
   * Update code component
   * TODO: support partial updates
   */
  async updateCodeComponent(codeComponent: cd.ICodeComponentDocument) {
    const path = projectContentsPathForId(codeComponent.id);
    return await this.databaseService.setDocument(path, codeComponent);
  }

  /** Delete code component */
  async deleteCodeComponent(codeComponent: cd.ICodeComponentDocument) {
    const path = projectContentsPathForId(codeComponent.id);
    return await this.databaseService.deleteDocument(path);
  }

  //#endregion

  //#region Design system changes

  /** Create design system */
  async createDesignSystem(designSystem: cd.IDesignSystemDocument): Promise<DocumentData> {
    const databasePath = projectContentsPathForId(designSystem.id);
    return await this.databaseService.setDocument(databasePath, designSystem);
  }

  /**
   * Update design system.
   * TODO: this should eventually be updatd to handle a partial
   */
  async updateDesignSystem(designSystem: cd.IDesignSystemDocument) {
    const databasePath = projectContentsPathForId(designSystem.id);
    return await this.databaseService.setDocument(databasePath, designSystem);
  }

  //#endregion

  //#region Dataset changes

  /** Create dataset */
  async createDatasets(datasets: cd.ProjectDataset[]) {
    const batchPayload: cd.WriteBatchPayload = new Map();
    for (const dataset of datasets) {
      const path = projectContentsPathForId(dataset.id);
      batchPayload.set(path, dataset);
    }
    return await this.databaseService.batchChanges(batchPayload);
  }

  /** Update dataset */
  async updateDataset(dataset: cd.ProjectDataset) {
    const path = projectContentsPathForId(dataset.id);
    return await this.databaseService.setDocument(path, dataset);
  }

  /** Update dataset data */
  updateDatasetData() {}

  /** Delete dataset */
  async deleteDataset(dataset: cd.ProjectDataset) {
    const path = projectContentsPathForId(dataset.id);
    return await this.databaseService.deleteDocument(path);
  }

  //#endregion

  //#region Asset changes

  /**  */
  async reateAssets(assets: cd.IProjectAsset[]) {
    const batchPayload: cd.WriteBatchPayload = new Map();
    for (const assetDoc of assets) {
      const docPath = projectContentsPathForId(assetDoc.id);
      batchPayload.set(docPath, assetDoc);
    }
    return await this.databaseService.batchChanges(batchPayload);
  }

  /**  */
  async updateAsset(id: string, update: Partial<cd.IProjectAsset>) {
    const path = projectContentsPathForId(id);
    return await this.databaseService.updateDocument(path, update);
  }

  //#endregion

  //#region Comment changes

  /**  */
  async createCommentThread(commentThread: cd.ICommentThreadDocument) {
    const path = commentPathForId(commentThread.id);
    return await this.databaseService.setDocument(path, commentThread);
  }

  /**  */
  async updateCommentThread(commentThread: cd.ICommentThreadDocument) {
    const path = commentPathForId(commentThread.id);
    return await this.databaseService.updateDocument(path, commentThread);
  }

  /**  */
  async deleteCommentThread(commentThread: cd.ICommentThreadDocument) {
    const path = commentPathForId(commentThread.id);
    return await this.databaseService.deleteDocument(path);
  }

  /**  */
  async createComment(comment: cd.ICommentDocument) {
    const path = commentPathForId(comment.id);
    return await this.databaseService.setDocument(path, comment);
  }

  /**  */
  async updateComment(comment: cd.ICommentDocument) {
    const path = commentPathForId(comment.id);
    return await this.databaseService.updateDocument(path, comment);
  }

  /**  */
  async deleteComment(comment: cd.ICommentDocument) {
    const path = commentPathForId(comment.id);
    return await this.databaseService.deleteDocument(path);
  }

  //#endregion

  //#region Publish entry changes

  /** Create publish entry */
  async createPublishEntry(publishEntry: cd.IPublishEntry) {
    const path = publishEntryPathForId(publishEntry.id);
    return await this.databaseService.setDocument(path, publishEntry);
  }

  /** Update publish entry */
  async updatePublishEntry(publishEntry: cd.IPublishEntry, update: cd.PublishEntryUpdatePayload) {
    const path = publishEntryPathForId(publishEntry.id);
    const keywords = generateKeywordsForPublishEntry(publishEntry);
    return await this.databaseService.updateDocument(path, { ...update, keywords });
  }

  /** Delete publish entry */
  async deletePublishEntry(publishEntry: cd.IPublishEntry) {
    const path = publishEntryPathForId(publishEntry.id);
    return await this.databaseService.deleteDocument(path);
  }

  //#endregion
}
