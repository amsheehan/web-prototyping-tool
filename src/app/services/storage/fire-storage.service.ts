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

import { inject, Injectable } from '@angular/core';
import { AbstractStorageService } from './abstract-storage.service';
import { ProgressStream } from '../../routes/project/interfaces/storage.interface';
import { AFStorageUploadHelper } from 'src/app/routes/project/interfaces/afstorage-upload-helper.model';
import { Storage, ref, deleteObject, uploadBytesResumable } from '@angular/fire/storage';
// import { Storage, ref, uploadBytesResumable, deleteObject } from '@angular/fire/storage';
import { IStringMap } from 'cd-interfaces';
// import { switchMap } from 'rxjs/operators';

// const CACHE_CONTROL = 'private, max-age=31536000';

@Injectable({
  providedIn: 'root',
})
export class FireStorageService extends AbstractStorageService {
  private storage: Storage = inject(Storage);

  constructor() {
    super();
  }

  uploadFile(path: string, blob: Blob, metadata?: IStringMap<string>): ProgressStream {
    console.log({ metadata });
    const storageRef = ref(this.storage, path);

    // const uploadTask = uploadBytesResumable(storageRef, blob);
    uploadBytesResumable(storageRef, blob);

    const helper = new AFStorageUploadHelper();

    return helper.getStream();
  }

  // async copyFile(srcPath: string, destPath: string, metadata?: IStringMap<string>): Promise<any> {
  //   const blob = await this._downloadFile(srcPath)
  //   return this.uploadFile(destPath, blob as Blob, metadata);
  // }

  deleteFile(path: string): void {
    const fileRef = ref(this.storage, path);

    deleteObject(fileRef)
      .then(() => {
        console.log(path, ' deleted');
      })
      .catch((error: any) => {
        console.error({ error });
      });
  }

  // private _downloadFile = async (path: string): Promise<Blob | undefined> => {
  //   const fileRef = ref(this.storage, path);

  //   const downloadUrl = await getDownloadURL(fileRef);

  //   const xhr = new XMLHttpRequest();
  //   xhr.responseType = 'blob';
  //   xhr.onload = (event: any) => {
  //     const b = xhr.response;
  //     return b;
  //   };
  //   xhr.open('GET', downloadUrl);
  //   xhr.send();

  //   return undefined;
  //   // return downloadUrls$.pipe(
  //   //   switchMap((url) => this.httpService.get(url, { responseType: 'blob' }))
  //   // );
  // };
}
