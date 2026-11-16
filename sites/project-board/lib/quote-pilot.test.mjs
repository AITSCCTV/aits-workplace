import {test} from 'node:test';import assert from 'node:assert/strict';import {blankQuote,validateQuote,quoteMetrics} from './quote-pilot.mjs';
test('unknown no automatic margin',()=>{assert.equal(quoteMetrics(blankQuote()).price,null)});
const complete=()=>({...blankQuote(),requirements:'camera',location:'site',contact:'customer',owner:'admin',engineering:'reviewed',items:[{name:'cost',qty:1,unit:'job',cost:600,source:'approved price',asOf:'2026-11-15'}],rate:40});
test('margin differs from markup',()=>{assert.equal(quoteMetrics({...complete(),mode:'margin'}).price,1000);assert.equal(quoteMetrics({...complete(),mode:'markup'}).price,840)});
test('missing cost not zero',()=>{const q=complete();q.items[0].cost=null;assert.equal(quoteMetrics(q).price,null)});
test('unsubstantiated approval rejected',()=>assert.throws(()=>validateQuote({...blankQuote(),stage:'approved'})));
test('cost date and source required',()=>{const q=complete();q.items[0].asOf='';assert.throws(()=>validateQuote(q))});
test('valid approval preserved',()=>assert.equal(validateQuote({...complete(),mode:'margin',stage:'approved',approval:'MD evidence'}).stage,'approved'));
