import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvent, mediaPath, eventMedia } from '../lib/events.mjs';
import { publishEvent } from '../scripts/upload-core.mjs';
const legacy = {id:'event_123',detectedAt:'2026-09-16T00:00:00Z',durationSeconds:15,camera:'Test'};
const event = {...legacy,analysisVersion:2,faceAnalysis:'complete',faces:[{id:'face-1',atSeconds:2,width:120,height:120,confidence:.883}]};
test('legacy metadata and face paths are bounded',()=>{
  assert.deepEqual(validateEvent(legacy).faces,[]);
  assert.deepEqual(eventMedia(event),['photo','clip','face-1']);
  assert.equal(eventMedia(event).includes('face-2'),false);
  for(const kind of ['../secret','face-5','face-0']) assert.throws(()=>mediaPath(event.id,kind));
  for(const face of [{...event.faces[0],atSeconds:100},{...event.faces[0],id:'../secret'},{...event.faces[0],confidence:.2}]) assert.throws(()=>validateEvent({...event,faces:[face]}));
});
test('face crops complete before publication and backfill preserves video',async()=>{
  const calls=[];
  const storage={read:async()=>({index:{version:1,events:[validateEvent(legacy)]},etag:'1'}),media:async p=>calls.push(p.split('/').at(-1)),index:async()=>calls.push('index')};
  await publishEvent(storage,event,'photo','clip',{'face-1':'crop'});
  assert.deepEqual(calls,['face-1.jpg','index']);
  calls.length=0;
  storage.media=async()=>{throw new Error('offline')};
  await assert.rejects(publishEvent(storage,event,'photo','clip',{'face-1':'crop'}));
  assert.deepEqual(calls,[]);
});
