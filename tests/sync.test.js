'use strict';

/**
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

const support = require('./support');
const plugin = require('./../lib');
const mongoose = require('mongoose');
const it = require('ava');

require('should');

/* eslint max-nested-callbacks:0 */
/* eslint require-jsdoc:0 */

let model;
const count = 10;

it.before(() => support.mongoose_connect());
it.before(() => {
  const schema = require('./support/schema');

  schema.plugin(plugin, {
    elastic: support.config.elastic,
    middleware: false,
    transform: doc => new Promise(resolve => {
      doc = doc.toObject();
      delete doc._id;

      setTimeout(() => resolve(doc), 50);
    })
  });

  model = mongoose.model(`${support.random()}_DocumentMethods`, schema);

  return model.es.createIndex();
});

it.before(() => {
  const docs = new Array(count).fill(null).map((tmp, n) => model.create({name: `Foo ${n}`}));

  return Promise.all(docs)
    .then(() => model.count())
    .then(count_of_doc => {
      if (!count_of_doc || count_of_doc !== count) {
        throw new Error('Docs not create');
      }
    });
});

it.after.always(() => support.removeAndClose(model));

it('synchronization', () => {
  return model.es
    .sync()
    .then(() => new Promise(resolve => setTimeout(resolve, 5000)))
    .then(() => model.es.refresh())
    .then(() => model.es.count())
    .then(res => res.count.should.be.equal(count));
});
