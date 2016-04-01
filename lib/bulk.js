'use strict';

class BulkRequest {
  constructor(agent, max_size, max_time) {
    if (!agent) {
      throw new TypeError('Agent: Elasticsearch client is required');
    }

    this.max_size = max_size || 1000;
    this.max_time = max_time || 1500;

    this.agent = agent;
    this.queries = [];
    this.promise = null;

    this.setTimeout();
  }

  setTimeout() {
    setTimeout(() => {
      if (this.isEmpty()) {
        return this.setTimeout();
      }

      return this.request();
    }, this.max_time);
  }

  isEmpty() {
    return !this.queries.length;
  }

  isFull() {
    return this.max_size === this.queries.length;
  }

  request() {
    if (this.promise) {
      return this.promise;
    }

    const defer = Promise.defer();

    this.promise = defer.promise;

    this.agent
      .bulk(this.getQueries())
      .then(response => {
        if (response.status < 200 || response.status > 299) {
          throw new Error(response.error);
        }

        return this.agent.refresh().then(() => {
          this.resolveQueries(response.items);
          defer.resolve(response);
        });
      })
      .catch(reason => {
        defer.reject(reason);
        this.rejectQueries(reason);
      });

    return this.promise;
  }

  resolveQueries(response_items) {
    response_items.forEach((item, index) => {
      item = pairs(item)[0];

      const result = item[1];

      if (this.queries[index]) {
        if (result.status < 200 || result.status > 299) {
          this.queries[index].defer.reject(result.error);
        } else {
          this.queries[index].defer.resolve(result);
        }
      }
    });
  }

  rejectQueries(reason) {
    this.queries.forEach(item => item.defer.reject(reason));
  }

  push(query) {
    if (this.promise) {
      throw new Error('Bulk is already running');
    }

    var defer = Promise.defer();

    this.queries.push({
      query,
      defer
    });

    if (this.isFull()) {
      this.request();
    }

    return defer.promise;
  }

  getQueries() {
    return this.queries.reduce((accum, item) => accum.concat(item.query), []);
  }
}

module.exports = BulkRequest;
