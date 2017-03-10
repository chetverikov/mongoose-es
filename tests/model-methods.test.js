'use strict';

const support = require('./support');
const plugin = require('./../lib');
const mongoose = require('mongoose');
const it = require('ava');

require('should');

/* eslint max-nested-callbacks:0 */
/* eslint require-jsdoc:0 */
let model;

it.before(() => support.mongoose_connect());
it.before(() => {
  const schema = require('./support/schema');

  schema.plugin(plugin);

  model = mongoose.model(`${support.random()}_DocumentMethods`, schema);

  return model.es.createIndex();
});

it.before(() => {
  const docs = new Array(30).fill(null).map((tmp, n) =>
    model
      .create({name: `Foo ${n}`})
      .then(doc =>
        new Promise(resolve => doc.on('es-index', resolve))
      )
  );

  return Promise.all(docs);
});

it.after.always(() => support.removeAndClose(model));

it('check count indexed documents', () => {
  return model.es.refresh()
    .then(() => model.es.count())
    .then(res => res.count.should.be.equal(30));
});
