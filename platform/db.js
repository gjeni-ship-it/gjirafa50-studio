/* Data layer for the Product Browser.
   - LIVE mode  : when DB_CONN is set, queries SQL Server (mssql) directly.
   - SNAPSHOT   : otherwise serves data/snapshot.json (full in-memory search/filter/sort/paging),
                  so the dashboard works before DB credentials are wired.
   Both modes return the same shape: { mode, total, items: [...] }. */
const fs = require('fs');
const path = require('path');

const STORE_ID = parseInt(process.env.STORE_ID || '2', 10);
const SNAPSHOT = path.join(__dirname, 'data', 'snapshot.json');

let mssql = null;
let poolPromise = null;
if (process.env.DB_CONN) {
  try { mssql = require('mssql'); }
  catch (e) { console.warn('[db] DB_CONN set but "mssql" not installed — run `npm i mssql`. Falling back to snapshot.'); }
}
const LIVE = !!(process.env.DB_CONN && mssql);

function pool() {
  if (!poolPromise) poolPromise = mssql.connect(process.env.DB_CONN);
  return poolPromise;
}

// merchandise-root category whitelist used by both the snapshot query and live query
const ROOT_WHITELIST = [1179,1287,1399,1623,1816,2159,2546,5585,5593,5599,5606,5612,5616,5617,5626,4899,6876,1];

const SORTS = {
  discount: '(tp.OldPrice - tp.Price) / NULLIF(tp.OldPrice,0) DESC, p.Id DESC',
  price_asc: 'tp.Price ASC, p.Id DESC',
  price_desc: 'tp.Price DESC, p.Id DESC',
  newest: 'p.Id DESC',
  name: 'p.Name ASC',
};

// ----------------------------------------------------------------- LIVE
async function queryLive(q) {
  const sort = SORTS[q.sort] || SORTS.discount;
  const r = pool ? await pool() : null;
  const req = (await pool()).request();
  req.input('store', mssql.Int, STORE_ID);
  req.input('search', mssql.NVarChar, '%' + (q.search || '') + '%');
  req.input('cat', mssql.NVarChar, q.category || '');
  req.input('off', mssql.Int, q.offset || 0);
  req.input('lim', mssql.Int, q.limit || 24);

  const onSale = q.onSale ? 'AND tp.OldPrice > tp.Price' : '';
  const inStock = q.inStock === false ? '' :
    'AND EXISTS (SELECT 1 FROM ProductWarehouseInventory w WHERE w.ProductId=p.Id AND (w.StockQuantity-w.ReservedQuantity)>0)';
  const searchClause = q.search ? 'AND p.Name LIKE @search' : '';

  // core (bounded) -> category climb -> category filter -> count + page
  const sql = `
    SELECT core.*, COUNT(*) OVER() AS total
    FROM (
      SELECT TOP 4000 p.Id AS product_id, p.Name AS product_name, tp.Price AS price, tp.OldPrice AS oldprice,
             rc.category
      FROM Product p
      JOIN TierPrice tp ON tp.ProductId=p.Id AND tp.StoreId=@store AND tp.Quantity=0 AND tp.Price>0
      OUTER APPLY (
        SELECT TOP 1 COALESCE(c5.Name,c4.Name,c3.Name,c2.Name,c1.Name,c0.Name) AS category
        FROM Product_Category_Mapping pcm JOIN Category c0 ON c0.Id=pcm.CategoryId AND c0.Deleted=0
        LEFT JOIN Category c1 ON c1.Id=c0.ParentCategoryId LEFT JOIN Category c2 ON c2.Id=c1.ParentCategoryId
        LEFT JOIN Category c3 ON c3.Id=c2.ParentCategoryId LEFT JOIN Category c4 ON c4.Id=c3.ParentCategoryId
        LEFT JOIN Category c5 ON c5.Id=c4.ParentCategoryId
        WHERE pcm.ProductId=p.Id
          AND COALESCE(c5.Name,c4.Name,c3.Name,c2.Name,c1.Name,c0.Name) NOT LIKE '%Promo%'
          AND COALESCE(c5.Name,c4.Name,c3.Name,c2.Name,c1.Name,c0.Name) NOT LIKE '%202%'
          AND COALESCE(c5.Name,c4.Name,c3.Name,c2.Name,c1.Name,c0.Name) NOT LIKE '%eals%'
        ORDER BY pcm.DisplayOrder
      ) rc
      WHERE p.Published=1 AND p.Deleted=0 AND p.VisibleIndividually=1
        ${searchClause} ${onSale} ${inStock}
      ORDER BY ${sort}
    ) core
    WHERE (@cat = '' OR core.category = @cat)
    ORDER BY core.product_id DESC
    OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY`;

  const res = await req.query(sql);
  const rows = res.recordset;
  const total = rows.length ? rows[0].total : 0;

  // enrich page rows with stock + image guid + slug (cheap: only page size)
  const ids = rows.map(r => r.product_id);
  let enrich = {};
  if (ids.length) {
    const er = (await pool()).request();
    const idList = ids.join(',');
    const e = await er.query(`
      SELECT p.Id AS product_id,
        (SELECT SUM(w.StockQuantity-w.ReservedQuantity) FROM ProductWarehouseInventory w WHERE w.ProductId=p.Id) AS stock,
        (SELECT TOP 1 pi.PictureGuid FROM Product_Picture_Mapping ppm JOIN Picture pi ON pi.Id=ppm.PictureId WHERE ppm.ProductId=p.Id ORDER BY ppm.DisplayOrder) AS picture_guid,
        (SELECT TOP 1 pi.MimeType FROM Product_Picture_Mapping ppm JOIN Picture pi ON pi.Id=ppm.PictureId WHERE ppm.ProductId=p.Id ORDER BY ppm.DisplayOrder) AS mime,
        (SELECT TOP 1 u.Slug FROM UrlRecord u WHERE u.EntityNameId=6 AND u.EntityId=p.Id AND u.IsActive=1 ORDER BY u.LanguageId) AS slug
      FROM Product p WHERE p.Id IN (${idList})`);
    e.recordset.forEach(x => { enrich[x.product_id] = x; });
  }
  const items = rows.map(r => shape({
    product_id: r.product_id, product_name: r.product_name, price: r.price, oldprice: r.oldprice,
    category: r.category || '',
    stock: (enrich[r.product_id] || {}).stock || 0,
    picture_guid: (enrich[r.product_id] || {}).picture_guid || '',
    mime: (enrich[r.product_id] || {}).mime || 'image/jpeg',
    slug: (enrich[r.product_id] || {}).slug || '',
  }));
  return { mode: 'live', total, items };
}

// ------------------------------------------------------------- SNAPSHOT
let SNAP = null;
function snap() {
  if (!SNAP) SNAP = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  return SNAP;
}
function querySnapshot(q) {
  let rows = snap().map(shape);
  if (q.search) { const s = q.search.toLowerCase(); rows = rows.filter(r => r.product_name.toLowerCase().includes(s)); }
  if (q.category) rows = rows.filter(r => r.category === q.category);
  if (q.onSale) rows = rows.filter(r => r.discount > 0);
  if (q.inStock !== false) rows = rows.filter(r => r.stock > 0);
  const cmp = {
    discount: (a, b) => b.discount - a.discount,
    price_asc: (a, b) => a.price - b.price,
    price_desc: (a, b) => b.price - a.price,
    newest: (a, b) => b.product_id - a.product_id,
    name: (a, b) => a.product_name.localeCompare(b.product_name),
  }[q.sort] || ((a, b) => b.discount - a.discount);
  rows.sort(cmp);
  const total = rows.length;
  const items = rows.slice(q.offset || 0, (q.offset || 0) + (q.limit || 24));
  return { mode: 'snapshot', total, items };
}

// -------------------------------------------------------------- shared
function shape(r) {
  const price = num(r.price), old = num(r.oldprice);
  const discount = (old && old > price) ? Math.round((old - price) / old * 100) : 0;
  return {
    product_id: r.product_id,
    product_name: r.product_name,
    price, oldprice: old, discount,
    stock: num(r.stock),
    category: r.category || '',
    picture_guid: r.picture_guid || '',
    mime: r.mime || 'image/jpeg',
    slug: r.slug || '',
  };
}
function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

async function categories() {
  if (LIVE) {
    try {
      const res = await (await pool()).request().query(
        `SELECT Name FROM Category WHERE ParentCategoryId=0 AND Published=1 AND Deleted=0 AND Id IN (${ROOT_WHITELIST.join(',')}) ORDER BY Name`);
      return res.recordset.map(r => r.Name);
    } catch (e) { /* fall through */ }
  }
  return [...new Set(snap().map(r => r.category).filter(Boolean))].sort();
}

async function listProducts(q) { return LIVE ? queryLive(q) : querySnapshot(q); }

module.exports = { listProducts, categories, isLive: () => LIVE, STORE_ID };
