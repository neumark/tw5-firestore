import {} from "jasmine";

import { readFileSync, createWriteStream } from 'fs';
import http from "http";

import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';

import { doc, getDoc, setDoc, serverTimestamp, setLogLevel, FieldValue } from 'firebase/firestore';

interface TiddlerData {
    tags?: string[];
    text?: string;
    type?: string;
    fields?: Record<string, string>;
    created?: FieldValue;
    creator?: string;
    modified?: FieldValue;
    modifier?: string;
    version: number;
}

let testEnv:RulesTestEnvironment;

const getUsers = (testEnv:RulesTestEnvironment) => ({
  anonymousDb: testEnv.unauthenticatedContext().firestore(),
  userDb: testEnv.authenticatedContext('alice').firestore(),
  adminDb: testEnv.authenticatedContext('bob', {admin: true}).firestore()
});

beforeAll(async () => {
  // Silence expected rules rejections from Firestore SDK. Unexpected rejections
  // will still bubble up and will be thrown as an error (failing the tests).
  setLogLevel('error');

  testEnv = await initializeTestEnvironment({
    projectId: 'demo-test',
    firestore: {rules: readFileSync('firestore.rules', 'utf8')},
  });

});

afterAll(async () => {
  // Delete all the FirebaseApp instances created during testing.
  // Note: this does not affect or clear any data.
  await testEnv.cleanup();

  // Write the coverage report to a file
  const coverageFile = 'firestore-coverage.html';
  const fstream = createWriteStream(coverageFile);
  await new Promise((resolve, reject) => {
    const { host, port } = testEnv.emulators.firestore ?? {host: "localhost", port: 8080};
    const quotedHost = host.includes(':') ? `[${host}]` : host;
    http.get(`http://${quotedHost}:${port}/emulator/v1/projects/${testEnv.projectId}:ruleCoverage.html`, (res) => {
      res.pipe(fstream, { end: true });

      res.on("end", resolve);
      res.on("error", reject);
    });
  });

  console.log(`View firestore rule coverage information at ${coverageFile}\n`);
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

const tiddlerPath = ({
  wiki="testWiki",
  bag="user:alice",
  title="testTiddler"}:Partial<{wiki:string,bag:string,title:string}>={}) => `tw5-firestore-wikis/${wiki}/bags/${bag}/tiddlers/${title}`

const objFilter = <V>(fn: (k: string, v: V) => boolean, input: Record<string, V>): Record<string, V> =>
  Object.fromEntries(Object.entries(input).filter(([k, v]) => fn(k, v)));


const tiddlerData = ({
  tags=undefined,
  text="asdf",
  type="text/vnd.tiddlywiki",
  fields=undefined,
  created=undefined,
  creator=undefined,
  modified=undefined,
  modifier=undefined,
  version=0}:Partial<TiddlerData>={}):TiddlerData => objFilter((k, v) => v !== undefined, {
    tags,
    text,
    type,
    fields,
    created,
    creator,
    modified,
    modifier,
    version
  }) as unknown as TiddlerData;

const createTiddlerData = ({
  created=serverTimestamp(),
  creator="alice",
  version=0,
  ...rest
}:Partial<TiddlerData>={}) => tiddlerData({created, creator, version, ...rest})

const updateTiddlerData = ({
  modified=serverTimestamp(),
  modifier="alice",
  ...rest
}:Partial<TiddlerData>={}) => tiddlerData({modified, modifier, ...rest})

describe("Private bag access", () => {
  it('only user can read their own bag', async function() {
    // Setup: Create documents in DB for testing (bypassing Security Rules).
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), tiddlerPath()), tiddlerData());
    });

    // user can read
    await assertSucceeds(getDoc(doc(getUsers(testEnv).userDb, tiddlerPath())));
    // admin is another user, cannot read
    await assertFails(getDoc(doc(getUsers(testEnv).adminDb, tiddlerPath())));
    // anonymous cannot read
    await assertFails(getDoc(doc(getUsers(testEnv).anonymousDb, tiddlerPath())));
  });

  it('only user can write their own bag', async function() {
    // Setup: Create documents in DB for testing (bypassing Security Rules).
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), tiddlerPath()), tiddlerData({version: 1 }));
    });


    // admin is another user, cannot write
    await assertFails(setDoc(doc(getUsers(testEnv).adminDb, tiddlerPath()), updateTiddlerData({version: 2})));
    // anonymous cannot write
    await assertFails(setDoc(doc(getUsers(testEnv).anonymousDb, tiddlerPath()), updateTiddlerData({version: 2})));
    // user can write
    await assertSucceeds(setDoc(doc(getUsers(testEnv).userDb, tiddlerPath()), updateTiddlerData({version: 2})));
  });
})

describe("tiddler version locking", () => {

  it('updates require version to be incremented by exactly 1', async function() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), tiddlerPath()), { ...tiddlerData(), version: 1 });
    });

    // version is the same: cannot write
    await assertFails(setDoc(doc(getUsers(testEnv).userDb, tiddlerPath()), updateTiddlerData({version: 1})));
    // version is too high: cannot write
    await assertFails(setDoc(doc(getUsers(testEnv).userDb, tiddlerPath()), updateTiddlerData({version: 3})));
    // version is correct: user can write
    await assertSucceeds(setDoc(doc(getUsers(testEnv).userDb, tiddlerPath()), updateTiddlerData({version: 2})));
  });

  it('create requires version to be exactly 0', async function() {
    // version is the same: cannot write
    await assertFails(setDoc(doc(getUsers(testEnv).userDb, tiddlerPath()), createTiddlerData({text: "asdf2", version: 1})));
    // version is too high: cannot write
    await assertFails(setDoc(doc(getUsers(testEnv).userDb, tiddlerPath()), createTiddlerData({text: "asdf2", version: 100})));
    // missing version field: cannot write
    const noVersion:any = createTiddlerData({text: "asdf2"})
    delete noVersion.version;
    await assertFails(setDoc(doc(getUsers(testEnv).userDb, tiddlerPath()), noVersion as TiddlerData));
    // version is correct: user can write
    await assertSucceeds(setDoc(doc(getUsers(testEnv).userDb, tiddlerPath()), createTiddlerData({text: "asdf2", version: 0})));
  });
})

/*
describe("tiddler data checks", () => {

  it('updates require version to be incremented by exactly 1', async function() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), tiddlerPath()), { text: 'asdf', version: 1 });
    });

    // version is the same: cannot write
    await assertFails(setDoc(doc(getUsers(testEnv).userDb, tiddlerPath()), {text: "asdf2", version: 1}));
    // version is too high: cannot write
    await assertFails(setDoc(doc(getUsers(testEnv).userDb, tiddlerPath()), {text: "asdf2", version: 3}));
    // version is correct: user can write
    await assertSucceeds(setDoc(doc(getUsers(testEnv).userDb, tiddlerPath()), {text: "asdf2", version: 2}));
  });


})
*/
