import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getStorage, provideStorage } from '@angular/fire/storage';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { NgModule, ErrorHandler } from '@angular/core';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { environment } from '../environments/environment';
import { RendererIFrameComponent } from './components/renderer-iframe/renderer-iframe.component';
import { PeopleService } from './services/people/people.service';
import { APP_ENV, DATA_FORMATTER_TOKEN, ToastManagerModule, TooltipService } from 'cd-common';
import { extModules, exProviders } from './build-specifics';
import { AnalyticsService } from './services/analytics/analytics.service';
import { ErrorService } from './services/error/error.service';
import { ServiceWorkerModule } from '@angular/service-worker';
import { ANALYTICS_SERVICE_TOKEN } from 'cd-common/analytics';
import { ShareDialogModule } from 'src/app/components/share-dialog/share-dialog.module';
import { FormatDataService } from './services/formatting/formatting.service';
import { registerComponentDefinitions } from 'cd-definitions';

const errorProvider = { provide: ErrorHandler, useClass: ErrorService };
const appEnvironmentProvider = { provide: APP_ENV, useValue: environment };
const analyticsServiceProvider = { provide: ANALYTICS_SERVICE_TOKEN, useClass: AnalyticsService };
const formatterServiceProvider = { provide: DATA_FORMATTER_TOKEN, useClass: FormatDataService };

@NgModule({
  declarations: [AppComponent, RendererIFrameComponent],
  imports: [
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideStorage(() => getStorage()),
    ShareDialogModule,
    ToastManagerModule,
    BrowserModule,
    HttpClientModule,
    AppRoutingModule,
    extModules,
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: environment.production && environment.pwa,
    }),
  ],
  providers: [
    exProviders,
    appEnvironmentProvider,
    formatterServiceProvider,
    analyticsServiceProvider,
    AnalyticsService,
    TooltipService,
    PeopleService,
    ErrorService,
    errorProvider,
  ],
  bootstrap: [AppComponent],
})
export class AppModule {
  constructor(protected _analyticsService: AnalyticsService, protected _tooltips: TooltipService) {
    // Load all built-in component definitions - this will populate components panel
    // It is necessary to do this here so that the defitions are available on the project page,
    // and also on the dashboard so we can create new models as part of the create new project flow
    registerComponentDefinitions();
  }
}
