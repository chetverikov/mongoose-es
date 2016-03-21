'use strict';

const support = require('./support');
const plugin = require('./../lib');
const mongoose = require('mongoose');
const times = require('lodash.times');

require('should');

/* eslint max-nested-callbacks:0 */
/* eslint require-jsdoc:0 */
describe('Model methods', () => {

  let model;

  before(() => support.mongoose_connect());
  before(() => {
    var schema = require('./support/schema');

    schema.plugin(plugin);

    model = mongoose.model(`${support.random()}_DocumentMethods`, schema);

    return model.es.createIndex();
  });

  after(() => support.removeAndClose(model));

  describe('model.refresh', () => {
    before(() => {
      var docs = [];
      times(30, n => {
        docs.push(
          model
            .create({name: `Foo ${n}`})
            .then(doc => {
              var def = Promise.defer();

              doc.on('es-index', () => def.resolve());

              return def.promise;
            })
        );
      });

      return Promise.all(docs);
    });

    it('refresh exec', () => model.es.refresh());

    it('check count indexed documents', () => {
      return model.es.count().then(res => res.count.should.be.equal(30));
    });
  });
});
