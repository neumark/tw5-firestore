import { ResolvedRecipe } from "./recipe";
import { ROLE } from "./roles";

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL?: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

/**
 * Defaults for the given tw5-firebase environment
 */
export interface TW5FirebaseEnvironmentConfig {
  defaultWikiName: string;
}

export type FrontendConfig = FirebaseConfig & TW5FirebaseEnvironmentConfig;

export interface BackendConfig {
  apiRegion: string;
  timeoutSeconds?: number; // max number of seconds to allow cloud function to run
  allowedDomains?: string[] // CORS-enbled origin domains
  cloudFunctions?: string[] // firebase deploy should deploy these functions
  hostingSites?: string[] // firebase deploy should deploy these hosting sites
}

/**
 * Served to frontend when wiki loads by ':wiki/config' endpoint
 */
 export interface WikiInitConfig {
  role: ROLE
  resolvedRecipe: ResolvedRecipe
}

export interface WikiLocation {
  wikiName: string,
  apiEndpoint: string,
}

export interface BuildConfig {
  defaultWikiLocation: WikiLocation
}

/**
 * Secret keys, in etc/keys*json
 */
export interface Keys {
  firebaseToken: string;
  refreshToken: string;
}
