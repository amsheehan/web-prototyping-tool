import { environment } from 'src/environments/environment';
import { mockModules, mockProviders, devModules, devProviders } from './config';

const { databaseEnabled } = environment;

export const extModules = databaseEnabled ? devModules : mockModules;
export const exProviders = databaseEnabled ? devProviders : mockProviders;
