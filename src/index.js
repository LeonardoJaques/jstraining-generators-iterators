const Pagination = require('./pagination');

(async () => {
  const pagination = new Pagination();
  //The number (770) and how much zeros that you want (e3)
  //770000
  const firstPage = 770e3;
  const request = pagination.getPaginated({
    url: 'https://www.mercadobitcoin.net/api/BTC/trades/',
    page: firstPage,
  });
  for await (const items of request) {
    console.table(items);
  }
})();
