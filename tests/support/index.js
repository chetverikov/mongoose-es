'use strict';

/**
 * @fileOverview Description file.
 * @author <a href="mailto:ma.chetverikov@gmail.com">Maksim Chetverikov</a>
 */

const mongoose = require('mongoose');

const config = {
  mongoose: {
    uri: 'localhost:27017',
    options: {}
  },
  elastic: {
    host: 'localhost:9200',
/*    log: {
      type: 'file',
      level: ['trace', 'debug', 'info'],
      path: 'elasticsearch.log'
    }*/
  }
};

module.exports = {
  config: config,
  mongoose_connect: options => {
    options = options || {};

    let uri;

    if (options.uri) {
      uri = options.uri;
      delete options.uri;
    } else {
      uri = config.mongoose.uri;
    }

    if (mongoose.connection && mongoose.connection.readyState !== 0) {
      return mongoose.connection.close().then(() => mongoose.connect(uri, options));
    }

    return mongoose.connect(uri, options);
  },

  random: () => Math.random().toString().substr(3),

  removeAndClose: model =>
    module.exports
      .removeCreatedIndexByModel(model)
      .then(() => mongoose.connection.close()),

  removeCreatedIndexByModel: model => model.es.client.indices.delete({
    index: model.collection.name
  })
};
