const { describe, it, before, afterEach } = require('mocha');
const assert = require('assert');
const { createSandbox } = require('sinon');
const Pagination = require('../src/pagination');
const Request = require('../src/request');
const { isRegExp } = require('util');

describe('Pagination tests', () => {
  let sandbox;
  before(() => (sandbox = createSandbox()));
  afterEach(() => sandbox.restore());

  describe('#Pagination', () => {
    describe('#sleep', () => {
      it(`should have default options on Pagination instance`, () => {
        const pagination = new Pagination();
        const expectedProperties = {
          maxRetries: 4,
          retryTimeout: 1000,
          maxRequestTimeout: 1000,
          threshold: 200,
        };

        assert.ok(pagination.request instanceof Request);
        Reflect.deleteProperty(pagination, 'request');

        const getEntries = (item) => Object.entries(item);
        assert.deepStrictEqual(
          getEntries(pagination),
          getEntries(expectedProperties)
        );
      });

      it(`should set default options on Pagination instance`, () => {
        const params = {
          maxRetries: 2,
          retryTimeout: 100,
          maxRequestTimeout: 10,
          threshold: 10,
        };

        const pagination = new Pagination(params);
        const expectedProperties = params;

        assert.ok(pagination.request instanceof Request);
        Reflect.deleteProperty(pagination, 'request');

        const getEntries = (item) => Object.entries(item);
        assert.deepStrictEqual(
          getEntries(pagination),
          getEntries(expectedProperties)
        );
      });

      it('should be a Promise object and not return values', async () => {
        const clock = sandbox.useFakeTimers();
        const time = 1;
        const pendingPromise = Pagination.sleep(time);
        clock.tick(time);

        assert.ok(pendingPromise instanceof Promise);
        const result = await pendingPromise;
        assert.ok(result === undefined);
      });
    });

    describe('#handleRequest', () => {
      it('should retry a request twice before throing an expection and validade request params and flow', async () => {
        const expectedCallCount = 2;
        const expectedTimeout = 10;

        const pagination = new Pagination();
        pagination.maxRetries = expectedCallCount;
        pagination.retryTimeout = expectedTimeout;
        pagination.maxRequestTimeout = expectedTimeout;

        const error = new Error('timeout');
        sandbox.spy(pagination, pagination.handleRequest.name);
        sandbox.stub(Pagination, Pagination.sleep.name).resolves();
        sandbox
          .stub(pagination.request, pagination.request.makeRequest.name)
          .rejects(error);

        const dataRequest = { url: 'https://google.com', page: 0 };
        await assert.rejects(pagination.handleRequest(dataRequest), error);
        assert.deepStrictEqual(
          pagination.handleRequest.callCount,
          expectedCallCount
        );

        const lastCall = 1;
        const firstCallArg = pagination.handleRequest.getCall(lastCall)
          .firstArg;
        const firstCallRetries = firstCallArg.retries;
        assert.deepStrictEqual(firstCallRetries, expectedCallCount);

        //When you concatenate is very important validade the object
        const expectedArgs = {
          url: `${dataRequest.url}?tid=${dataRequest.page}`,
          method: 'get',
          timeout: expectedTimeout,
        };
        const firstCallArgs = pagination.request.makeRequest.getCall(0).args;
        assert.deepStrictEqual(firstCallArgs, [expectedArgs]);

        assert.ok(Pagination.sleep.calledWithExactly(expectedTimeout));
      });
      it('should return data from request when succeded', async () => {
        const data = { result: 'ok' };
        const pagination = new Pagination();

        sandbox
          .stub(pagination.request, pagination.request.makeRequest.name)
          .resolves(data);

        const result = await pagination.handleRequest({
          url: 'https://google.com',
          page: 1,
        });
        assert.deepStrictEqual(result, data);
      });
    });

    describe('#getPaginated', () => {
      const responseMock = [
        {
          tid: 8191061,
          date: 1611853484,
          type: 'buy',
          price: 174799.8998,
          amount: 0.00932356,
        },
        {
          tid: 8191062,
          date: 1611853489,
          type: 'sell',
          price: 174700.10001,
          amount: 0.00555123,
        },
      ];

      it('shoul update request id on each request', async () => {
        const pagination = new Pagination();
        sandbox.stub(Pagination, Pagination.sleep.name).resolves();
        sandbox
          .stub(pagination, pagination.handleRequest.name)
          .onCall(0)
          .resolves([responseMock[0]])
          .onCall(1)
          .resolves([responseMock[1]])
          .onCall(2)
          .resolves([]);

        sandbox.spy(pagination, pagination.getPaginated.name);
        const data = { url: 'https://google.com', page: 1 };
        const secondCallExpection = {
          ...data,
          page: responseMock[0].tid,
        };

        const thirdCallExpection = {
          ...secondCallExpection,
          page: responseMock[1].tid,
        };

        /*for call a generator function
         * Array.from(pagination.getPaginated())=> this way it doesnt await the data on demand
         * It will keep all in memory and after throw in the array
         * const r = pagination.getPaginated()
         * r.next() => {done: true || false, value: {} }
         * The best away is use "for of"
         */
        const gen = pagination.getPaginated(data);
        for await (const result of gen) {
        }

        const getFirstArgFromCall = (value) =>
          pagination.handleRequest.getCall(value).firstArg;
        assert.deepStrictEqual(getFirstArgFromCall(0), data);
        assert.deepStrictEqual(getFirstArgFromCall(1), secondCallExpection);
        assert.deepStrictEqual(getFirstArgFromCall(2), thirdCallExpection);
      });
      it('shoul stop requesting when request an empyt array', async () => {
        const expectedThreshold = 20;
        const pagination = new Pagination();
        pagination.threshold = expectedThreshold;

        sandbox.stub(Pagination, Pagination.sleep.name).resolves();

        sandbox
          .stub(pagination, pagination.handleRequest.name)
          .onCall(0)
          .resolves([responseMock[0]])
          .onCall(1)
          .resolves([]);
        sandbox.spy(pagination, pagination.getPaginated.name);

        const data = { url: 'https://google.com', page: 1 };
        const iterator = await pagination.getPaginated(data);
        const [firstResult, secondResult] = await Promise.all([
          iterator.next(),
          iterator.next(),
        ]);

        const expectedFirstCall = { done: false, value: [responseMock[0]] };
        assert.deepStrictEqual(firstResult, expectedFirstCall);

        const expectedSecondCall = { done: true, value: undefined };
        assert.deepStrictEqual(secondResult, expectedSecondCall);

        assert.deepStrictEqual(Pagination.sleep.callCount, 1);
        assert.ok(Pagination.sleep.calledWithExactly(expectedThreshold));
      });
    });
  });
});
