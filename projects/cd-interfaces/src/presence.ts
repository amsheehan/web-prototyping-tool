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
import { IRect, IUser } from './public_api';
import { ICanvas } from './canvas';
import { IRenderResult } from './render-results';

export interface IUserPresence {
  /** The user who is present */
  user: IUser;

  /** The session id of a particular tab */
  sessionId: string;

  /** The project that is open in this session */
  projectId: string;

  /** The time at which this session started */
  creationTime: Timestamp;

  /** Last time that this session polled to mark presence as active */
  pollTime: Timestamp;
}

export interface IUserCursor {
  x: number;
  y: number;
  canvas: ICanvas;
  sessionId: string;
  isolatedSymbolId?: string;
  marqueeRect?: IRect;
}

export interface IUserSelection {
  sessionId: string;
  selectedIdsByOutlet: Record<string, string[]>;
  outletFramesSelected: boolean;
  isolatedSymbolId?: string;
}

export interface IUserRect {
  renderResult: IRenderResult;
  sessionId: string;
}

export interface IRtcConnectionRequest {
  fromSessionId: string;
  toSessionId: string;
  rtcOfferDesc: RTCSessionDescriptionInit;
  rtcAnswerDesc: RTCSessionDescriptionInit | null;
}
