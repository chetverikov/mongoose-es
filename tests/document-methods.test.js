'use strict';

/**
 * @fileOverview Description file.
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

const support = require('./support');
const plugin = require('./../lib');
const should = require('should');
const mongoose = require('mongoose');

/* eslint max-nested-callbacks:0 */
/* eslint require-jsdoc:0 */
/* eslint no-underscore-dangle:0 */
describe('Document methods', () => {

  let model;

  before(() => support.mongoose_connect());
  before(() => {
    const schema = require('./support/schema');

    schema.plugin(plugin, {
      middleware: false
    });

    model = mongoose.model(`${support.random()}_DocumentMethods`, schema);

    return model.es.createIndex();
  });

  after(() => support.removeAndClose(model));

  it('document.index', () => {
    return model
      .create({
        name: 'Foo',
        phones: ['89000980909', '1234322344']
      })
      .then(document => Promise.all([document, document.index()]))
      .then(data => {
        const res = data[1];
        const document = data[0];

        should.ok(res.created);
        res._id.should.be.equal(document._id.toString());
      });
  });

  it('document.unindex', () => {
    return model.create({
      name: 'Foo',
      phones: ['89000980909', '1234322344']
    }).then(document => {
      var defer = Promise.defer();

      document.on('es-index', () => {
        model.es.refresh().then(() => {
          document.on('es-unIndex', res => {
            should.ok(res.found);

            res._index.should.be.equal(model.collection.name);
            res._type.should.be.equal(model.modelName);

            defer.resolve();
          });
          document.unIndex();
        })
        .catch(err => defer.reject(err));
      });
      
      document.index();

      return defer.promise;
    });
  });
});
