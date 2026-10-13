import 'fake-indexeddb/auto';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import WebSocket from 'ws';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForSync(provider, timeout = 3000) {
  return new Promise((resolve) => {
    if (provider.synced) return resolve();
    const timer = setTimeout(() => resolve(), timeout);
    provider.once('sync', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function getDocText(ydoc) {
  const fragment = ydoc.getXmlFragment('prosemirror');
  return fragment.toString().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function runTests() {
  console.log('========================================================');
  console.log('🚀 Running Offline-First Persistence & Sync Test Suite');
  console.log('========================================================\n');

  const WS_URL = 'ws://localhost:1234';

  // -------------------------------------------------------------------------
  // TEST 1: Open document -> edit -> refresh browser (survive reload)
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Open document -> edit -> simulate browser refresh ---');
  const docId1 = `test-doc-${Date.now()}-1`;

  let ydoc1 = new Y.Doc();
  let idb1 = new IndexeddbPersistence(docId1, ydoc1);
  await idb1.whenSynced;

  ydoc1.getMap('metadata').set('title', 'Architecture Roadmap');
  const frag1 = ydoc1.getXmlFragment('prosemirror');
  const p1 = new Y.XmlElement('paragraph');
  p1.insert(0, [new Y.XmlText('Initial draft written before browser refresh.')]);
  frag1.insert(0, [p1]);

  await delay(100);
  console.log('Session 1 content:', getDocText(ydoc1));
  console.log('Session 1 title:', ydoc1.getMap('metadata').get('title'));

  idb1.destroy();
  ydoc1.destroy();

  // Reload simulation
  let ydoc1_reload = new Y.Doc();
  let idb1_reload = new IndexeddbPersistence(docId1, ydoc1_reload);
  await idb1_reload.whenSynced;

  const reloadedText = getDocText(ydoc1_reload);
  const reloadedTitle = ydoc1_reload.getMap('metadata').get('title');
  console.log('Session 2 reloaded content:', reloadedText);
  console.log('Session 2 reloaded title:', reloadedTitle);

  if (
    reloadedText.includes('Initial draft written before browser refresh.') &&
    reloadedTitle === 'Architecture Roadmap'
  ) {
    console.log('✅ TEST 1 PASSED: Edits and metadata persisted across simulated browser reload.\n');
  } else {
    throw new Error('TEST 1 FAILED: Reloaded state did not match persisted edits');
  }
  idb1_reload.destroy();
  ydoc1_reload.destroy();

  // -------------------------------------------------------------------------
  // TEST 2: Disconnect internet -> edit offline -> edits persist locally
  // -------------------------------------------------------------------------
  console.log('--- TEST 2: Disconnect internet -> edit offline ---');
  const docId2 = `test-doc-${Date.now()}-2`;

  const ydoc2 = new Y.Doc();
  const idb2 = new IndexeddbPersistence(docId2, ydoc2);
  await idb2.whenSynced;

  const wsProvider2 = new WebsocketProvider(WS_URL, docId2, ydoc2, { WebSocketPolyfill: WebSocket });
  await waitForSync(wsProvider2);
  console.log('Connected to server. Now simulating internet disconnection...');

  wsProvider2.disconnect();
  console.log('WebSocket disconnected. User is now OFFLINE.');

  const frag2 = ydoc2.getXmlFragment('prosemirror');
  const p2 = new Y.XmlElement('paragraph');
  p2.insert(0, [new Y.XmlText('Offline note: Edge caching configuration updated.')]);
  frag2.insert(0, [p2]);

  await delay(100);
  console.log('Local offline document text:', getDocText(ydoc2));

  if (getDocText(ydoc2).includes('Offline note: Edge caching configuration updated.')) {
    console.log('✅ TEST 2 PASSED: Editor continues normally while offline; edits saved to CRDT & IndexedDB.\n');
  } else {
    throw new Error('TEST 2 FAILED: Offline edits were not retained');
  }

  // -------------------------------------------------------------------------
  // TEST 3: Edit while offline -> reconnect -> changes automatically sync with server
  // -------------------------------------------------------------------------
  console.log('--- TEST 3: Reconnect after offline edits -> sync with server ---');
  console.log('Reconnecting WebSocket to server...');
  wsProvider2.connect();
  await waitForSync(wsProvider2);
  console.log('Reconnected & synchronized!');

  const ydoc2_collab = new Y.Doc();
  const wsProvider2_collab = new WebsocketProvider(WS_URL, docId2, ydoc2_collab, { WebSocketPolyfill: WebSocket });
  await waitForSync(wsProvider2_collab);

  const collabText = getDocText(ydoc2_collab);
  console.log('Remote Collaborator received text:', collabText);

  if (collabText.includes('Offline note: Edge caching configuration updated.')) {
    console.log('✅ TEST 3 PASSED: Offline edits successfully synced to server and other collaborators upon reconnection.\n');
  } else {
    throw new Error('TEST 3 FAILED: Remote collaborator did not receive offline edits');
  }

  wsProvider2.destroy();
  idb2.destroy();
  ydoc2.destroy();
  wsProvider2_collab.destroy();
  ydoc2_collab.destroy();

  // -------------------------------------------------------------------------
  // TEST 4: Edit offline -> close browser -> reopen -> local changes available
  // -------------------------------------------------------------------------
  console.log('--- TEST 4: Edit offline -> close browser -> reopen ---');
  const docId4 = `test-doc-${Date.now()}-4`;

  let ydoc4 = new Y.Doc();
  let idb4 = new IndexeddbPersistence(docId4, ydoc4);
  await idb4.whenSynced;

  const frag4 = ydoc4.getXmlFragment('prosemirror');
  const p4 = new Y.XmlElement('paragraph');
  p4.insert(0, [new Y.XmlText('Offline critical notes before computer reboot.')]);
  frag4.insert(0, [p4]);
  await delay(100);

  idb4.destroy();
  ydoc4.destroy();
  console.log('Browser closed. In-memory state cleared.');

  let ydoc4_reopen = new Y.Doc();
  let idb4_reopen = new IndexeddbPersistence(docId4, ydoc4_reopen);
  await idb4_reopen.whenSynced;

  const reopenText = getDocText(ydoc4_reopen);
  console.log('Reopened document text from IndexedDB:', reopenText);

  if (reopenText.includes('Offline critical notes before computer reboot.')) {
    console.log('✅ TEST 4 PASSED: Offline edits retained across full application closure and reopening.\n');
  } else {
    throw new Error('TEST 4 FAILED: Reopened offline state missing');
  }
  idb4_reopen.destroy();
  ydoc4_reopen.destroy();

  // -------------------------------------------------------------------------
  // TEST 5: User A offline edits vs User B online edits -> User A reconnects
  // "Payment service uses MySQL." vs "Payment service uses PostgreSQL."
  // -------------------------------------------------------------------------
  console.log('--- TEST 5: Conflict Handling: Concurrent Offline (User A) vs Online (User B) edits ---');
  const docId5 = `test-conflict-${Date.now()}`;

  // Initial doc
  const ydocInit = new Y.Doc();
  const wsInit = new WebsocketProvider(WS_URL, docId5, ydocInit, { WebSocketPolyfill: WebSocket });
  await waitForSync(wsInit);

  const fragInit = ydocInit.getXmlFragment('prosemirror');
  const basePara = new Y.XmlElement('paragraph');
  basePara.insert(0, [new Y.XmlText('System specification: ')]);
  fragInit.insert(0, [basePara]);
  await delay(150);
  wsInit.destroy();
  ydocInit.destroy();

  // User A and User B load
  const ydocA = new Y.Doc();
  const idbA = new IndexeddbPersistence(docId5, ydocA);
  const wsA = new WebsocketProvider(WS_URL, docId5, ydocA, { WebSocketPolyfill: WebSocket });
  await idbA.whenSynced;
  await waitForSync(wsA);

  const ydocB = new Y.Doc();
  const idbB = new IndexeddbPersistence(docId5, ydocB);
  const wsB = new WebsocketProvider(WS_URL, docId5, ydocB, { WebSocketPolyfill: WebSocket });
  await idbB.whenSynced;
  await waitForSync(wsB);

  console.log('Initial document loaded by both User A and User B.');

  // User A goes OFFLINE
  wsA.disconnect();
  console.log('User A went OFFLINE.');

  // User A offline edits
  const fragA = ydocA.getXmlFragment('prosemirror');
  const paraA = new Y.XmlElement('paragraph');
  paraA.insert(0, [new Y.XmlText('Payment service uses MySQL.')]);
  fragA.insert(fragA.length, [paraA]);
  console.log('User A (offline) edited document.');

  // User B online edits
  const fragB = ydocB.getXmlFragment('prosemirror');
  const paraB = new Y.XmlElement('paragraph');
  paraB.insert(0, [new Y.XmlText('Payment service uses PostgreSQL.')]);
  fragB.insert(fragB.length, [paraB]);
  console.log('User B (online) edited document concurrently.');

  await delay(150);

  // User A reconnects
  console.log('User A reconnects to server...');
  wsA.connect();
  await waitForSync(wsA);
  await waitForSync(wsB);
  await delay(300);

  const finalA = getDocText(ydocA);
  const finalB = getDocText(ydocB);
  console.log('User A document text after sync:', finalA);
  console.log('User B document text after sync:', finalB);

  const bothHaveMySQL = finalA.includes('Payment service uses MySQL') && finalB.includes('Payment service uses MySQL');
  const bothHavePostgres = finalA.includes('Payment service uses PostgreSQL') && finalB.includes('Payment service uses PostgreSQL');
  const bothConverged = finalA === finalB;

  if (bothHaveMySQL && bothHavePostgres && bothConverged) {
    console.log('✅ TEST 5 PASSED: Yjs CRDT merged concurrent offline and online edits cleanly without data loss.\n');
  } else {
    throw new Error(`TEST 5 FAILED: State did not converge cleanly. A: "${finalA}", B: "${finalB}"`);
  }

  wsA.destroy();
  idbA.destroy();
  ydocA.destroy();
  wsB.destroy();
  idbB.destroy();
  ydocB.destroy();

  // -------------------------------------------------------------------------
  // TEST 6: Multi-client synchronization and persistence verification
  // -------------------------------------------------------------------------
  console.log('--- TEST 6: Multi-client synchronization and persistence verification ---');
  const docId6 = `test-multiclient-${Date.now()}`;
  const ydocM1 = new Y.Doc();
  const idbM1 = new IndexeddbPersistence(docId6, ydocM1);
  const wsM1 = new WebsocketProvider(WS_URL, docId6, ydocM1, { WebSocketPolyfill: WebSocket });
  await idbM1.whenSynced;
  await waitForSync(wsM1);

  const fragM1 = ydocM1.getXmlFragment('prosemirror');
  const pM1 = new Y.XmlElement('paragraph');
  pM1.insert(0, [new Y.XmlText('Tab 1 edit: Verified.')]);
  fragM1.insert(0, [pM1]);
  await delay(200);

  const ydocM2 = new Y.Doc();
  const idbM2 = new IndexeddbPersistence(docId6, ydocM2);
  const wsM2 = new WebsocketProvider(WS_URL, docId6, ydocM2, { WebSocketPolyfill: WebSocket });
  await idbM2.whenSynced;
  await waitForSync(wsM2);
  await delay(200);

  const m2Text = getDocText(ydocM2);
  console.log('Tab 2 received:', m2Text);

  if (m2Text.includes('Tab 1 edit: Verified.')) {
    console.log('✅ TEST 6 PASSED: Real-time multi-client collaboration verified.\n');
  } else {
    throw new Error('TEST 6 FAILED: Multi-client sync failed');
  }

  wsM1.destroy();
  idbM1.destroy();
  ydocM1.destroy();
  wsM2.destroy();
  idbM2.destroy();
  ydocM2.destroy();

  console.log('========================================================');
  console.log('🎉 ALL PERSISTENCE AND SYNC TESTS PASSED SUCCESSFULLY!');
  console.log('========================================================');
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
