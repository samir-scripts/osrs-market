const fetch = require('node-fetch');

async function run() {
  const query = `
    query GetCatalogue {
      items_metadata(where: {item_id: {_eq: 554}}) {
        item_id
        name
        value
        prices(limit: 1) {
          avg_high_price
          previous_avg_high_price
        }
      }
    }
  `;

  const res = await fetch('http://localhost:8080/v1/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hasura-Admin-Secret': 'hasura_secure_admin_secret'
    },
    body: JSON.stringify({ query })
  });

  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}
run();
