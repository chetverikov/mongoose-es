'use strict';

/**
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

const support = require('./support');
const plugin = require('./../lib');
const mongoose = require('mongoose');
const times = require('lodash.times');

require('should');

/* eslint max-nested-callbacks:0 */
/* eslint require-jsdoc:0 */
describe('Sync', function() {
  let model;
  const count = 3000;

  this.timeout(10000);

  before(() => support.mongoose_connect());
  before(() => {
    var schema = require('./support/schema');

    schema.plugin(plugin, {
      meddleware: false
    });

    model = mongoose.model(`${support.random()}_DocumentMethods`, schema);

    return model.es.createIndex();
  });

  before(() => {
    var docs = [];

    times(count, n => docs.push(model.create({name: `Foo ${n}`})));

    return Promise
      .all(docs)
      .then(() => model.count())
      .then(count_of_doc => {
        if (!count_of_doc || count_of_doc !== count){
          throw new Error('Docs not create');
        }
      });
  });

  after(() => support.removeAndClose(model));

  it('synchronization', () => {
    return model.es
      .sync()
      .then(() => model.es.refresh())
      .then(() => model.es.count())
      .then(res => res.count.should.be.equal(count));
  });
});
