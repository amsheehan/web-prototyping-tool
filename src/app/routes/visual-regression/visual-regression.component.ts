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

import {
  inject,
  Component,
  OnInit,
  ChangeDetectionStrategy,
  OnDestroy,
  ChangeDetectorRef,
} from '@angular/core';
import { Storage, ref, listAll, ListResult, getDownloadURL } from '@angular/fire/storage';
import { forkJoin, from, Observable, Subscription } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

const ROOT_FOLDER = 'image-capture-tests';

interface IImageCapture {
  url: string;
  name: string;
}

@Component({
  selector: 'app-visual-regression',
  templateUrl: './visual-regression.component.html',
  styleUrls: ['./visual-regression.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisualRegressionComponent implements OnInit, OnDestroy {
  private _subscription = new Subscription();
  private storage: Storage = inject(Storage);
  public folders: string[] = [];
  public imagesA?: Observable<IImageCapture[]>;
  public imagesB?: Observable<IImageCapture[]>;
  public activeA = 0;
  public activeB = 1;

  constructor(private _cdRef: ChangeDetectorRef) {}

  ngOnDestroy(): void {
    this._subscription.unsubscribe();
  }

  ngOnInit(): void {
    const folders$ = from(listAll(ref(this.storage, ROOT_FOLDER)));
    this._subscription.add(folders$.subscribe(this.onInitalFolderLoad));
  }

  onInitalFolderLoad = (res: ListResult) => {
    this.folders = res.prefixes.map((item) => item.name);
    this._cdRef.markForCheck();
    this.loadFolderA();
    this.loadFolderB();
  };

  getFolderFromIndex(idx: number): string {
    return this.folders[idx];
  }

  onSelectA(idx: number) {
    if (this.activeA === idx) return;
    this.activeA = idx;
    this.loadFolderA();
  }

  onSelectB(idx: number) {
    if (this.activeB === idx) return;
    this.activeB = idx;
    this.loadFolderB();
  }

  getFolderContentsObservable(path: string) {
    const l = listAll(ref(this.storage, `${ROOT_FOLDER}/${path}`)); // list child paths???

    return from(l).pipe(switchMap(this.processImages));
  }

  loadFolderA = () => {
    const path = this.getFolderFromIndex(this.activeA);
    this.imagesA = this.getFolderContentsObservable(path);
  };

  processImages = (res: ListResult): Observable<IImageCapture[]> => {
    const imageStream = res.items.map((item) =>
      from(getDownloadURL(item)).pipe(map((url) => ({ name: item.name, url })))
    );
    return forkJoin([...imageStream]);
  };

  loadFolderB = () => {
    const path = this.getFolderFromIndex(this.activeB);
    this.imagesB = this.getFolderContentsObservable(path);
  };
}
