import test from 'node:test';
import assert from 'node:assert/strict';
import {time,status} from './model.mjs';
test('all times explicitly use Shanghai rather than browser zone',()=>{assert.match(time(1704067200),/2024.*01.*01.*08:00:00/);assert.equal(time(null),'—');});
test('expired execution is visible as recovery pending',()=>{assert.equal(status({status:'running',lease_until:99},100),'执行中断，等待恢复');});
test('slow retry is not labelled failed',()=>{assert.equal(status({status:'waiting',next_run_at:200,no_progress_count:31,fast_retries:30},100),'慢速重试等待');});
test('manual approval and cancellation are distinct',()=>{assert.equal(status({status:'waiting',phase:'await_confirmation'},100),'等待人工批准');assert.match(status({status:'cancel_requested'},100),/安全清理/);});

test('quarantined retry remains resumable and distinct',()=>{assert.match(status({status:'waiting',quarantined:true},100),/低频重试/);assert.equal(status({status:'paused',quarantined:true},100),'已暂停');});
