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

import type { Timestamp } from 'firebase/firestore';

import { IBaseDocument, IBaseDocumentMetadata } from './database';

export enum PublishType {
  Template = 'Template',
  Symbol = 'Symbol',
  CodeComponent = 'CodeComponent',
}

export interface IPublishVersion {
  id: string;
  name: string;
  createdAt: Timestamp;
  projectId: string;

  // If this version is for a published symbol or code component, this is its id within the project
  symbolId?: string;
  codeComponentId?: string;
}

export interface IPublishEntry extends IBaseDocument, IBaseDocumentMetadata {
  id: string;
  type: PublishType;
  versions: IPublishVersion[];
}

export type PublishEntryUpdatePayload = Partial<Pick<IPublishEntry, 'name' | 'desc' | 'tags'>>;

export interface IPublishId {
  entryId: string;
  versionId: string;
}

export interface IPublishable {
  publishId?: IPublishId;
}

export interface IPublishDetails {
  id: string;
  type: PublishType;
  name: string;
  description: string;
  tags: string[];
  currentPublishId?: IPublishId;
}

export interface IPublishResult {
  id: string;
  type: PublishType;
  publishId: IPublishId;
  publishEntry: IPublishEntry;
}
