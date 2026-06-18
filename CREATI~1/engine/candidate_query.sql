/* ============================================================================
   Gjirafa50 KS — Daily product-selection CANDIDATE QUERY
   Run via the Gjirafa50 MCP database tool (queryGjirafa50Db).
   Returns the eligible deal pool; scoring + slotting happen in select_products.py
   (or in the dashboard JS). Set @StoreId / TOP N as needed.

   DATA-MODEL NOTES (discovered, important):
     * Product.Price and Product.StockQuantity are PLACEHOLDERS (0 / 10000). Do NOT use them.
     * Real price + regular price live in TierPrice per StoreId (Quantity = 0 row).
         StoreId 1 = Gjirafa50 MK, 2 = Gjirafa50 KS, 3 = Gjirafa50 AL, 4 = iGjirafa.
     * Real stock lives in ProductWarehouseInventory (StockQuantity - ReservedQuantity).
     * Public promo discounts = Discount.DiscountTypeId = 2 (assigned to products),
         StoreId in (0, current store), no coupon, and NOT tied to a customer role
         (we exclude DiscountRequirement rows so login-only loyalty prices are ignored).
     * Margin is NOT available (ProductCost = 0; no ProfitMargin column).
   FILTERS implement brief rules 1 (stock>0) & 2 (has image); rule 3/4/5 = scoring.
   ============================================================================ */
SELECT TOP 150
  p.Id                         AS product_id,
  p.Name                       AS product_name,
  tp.Price                     AS shelf_price,      -- current shelf price (store currency)
  tp.OldPrice                  AS old_price,        -- regular / pre-markdown price
  inv.avail                    AS stock,            -- real available units
  ISNULL(bd.max_pct, 0)        AS disc_pct_campaign,-- best public % campaign
  ISNULL(bd.max_amt, 0)        AS disc_amt_campaign,-- best public amount campaign
  rc.root_name                 AS category,         -- real top-level merchandise category
  ISNULL(s.units_90d, 0)       AS previous_sales,   -- units sold, last 90 days, this store
  pic.PictureGuid              AS picture_guid,
  pic.MimeType                 AS mime,
  ur.Slug                      AS slug
FROM Product p
JOIN TierPrice tp
     ON tp.ProductId = p.Id AND tp.StoreId = 2 AND tp.Quantity = 0 AND tp.Price > 0
JOIN (SELECT ProductId, SUM(StockQuantity - ReservedQuantity) AS avail
        FROM ProductWarehouseInventory
       GROUP BY ProductId
      HAVING SUM(StockQuantity - ReservedQuantity) > 0) inv          -- rule 1: in stock
     ON inv.ProductId = p.Id
/* best public campaign discount (percentage and amount kept separate) */
OUTER APPLY (
  SELECT MAX(CASE WHEN d.UsePercentage = 1 THEN d.DiscountPercentage ELSE 0 END) AS max_pct,
         MAX(CASE WHEN d.UsePercentage = 0 THEN d.DiscountAmount     ELSE 0 END) AS max_amt
  FROM Discount_AppliedToProducts ap
  JOIN Discount d ON d.Id = ap.Discount_Id
  WHERE ap.Product_Id = p.Id AND d.DiscountTypeId = 2 AND d.StoreId IN (0, 2) AND d.RequiresCouponCode = 0
    AND (d.StartDateUtc IS NULL OR d.StartDateUtc <= GETUTCDATE())
    AND (d.EndDateUtc   IS NULL OR d.EndDateUtc   >= GETUTCDATE())
    AND NOT EXISTS (SELECT 1 FROM DiscountRequirement dr WHERE dr.DiscountId = d.Id) -- exclude role/login-only
) bd
/* map product to its real top-level merchandise category (skip promo buckets) */
OUTER APPLY (
  SELECT TOP 1 COALESCE(c5.Name, c4.Name, c3.Name, c2.Name, c1.Name, c0.Name) AS root_name
  FROM Product_Category_Mapping pcm
  JOIN Category c0 ON c0.Id = pcm.CategoryId
  LEFT JOIN Category c1 ON c1.Id = c0.ParentCategoryId
  LEFT JOIN Category c2 ON c2.Id = c1.ParentCategoryId
  LEFT JOIN Category c3 ON c3.Id = c2.ParentCategoryId
  LEFT JOIN Category c4 ON c4.Id = c3.ParentCategoryId
  LEFT JOIN Category c5 ON c5.Id = c4.ParentCategoryId
  WHERE pcm.ProductId = p.Id
    AND (CASE WHEN c0.ParentCategoryId = 0 THEN c0.Id WHEN c1.ParentCategoryId = 0 THEN c1.Id
              WHEN c2.ParentCategoryId = 0 THEN c2.Id WHEN c3.ParentCategoryId = 0 THEN c3.Id
              WHEN c4.ParentCategoryId = 0 THEN c4.Id WHEN c5.ParentCategoryId = 0 THEN c5.Id END)
        IN (1179,1287,1399,1623,1816,2159,2546,5585,5593,5599,5606,5612,5616,5617,5626,4899,6876,1)
  ORDER BY pcm.DisplayOrder
) rc
/* primary image (rule 2: has image) */
OUTER APPLY (SELECT TOP 1 pi.PictureGuid, pi.MimeType
             FROM Product_Picture_Mapping ppm JOIN Picture pi ON pi.Id = ppm.PictureId
             WHERE ppm.ProductId = p.Id ORDER BY ppm.DisplayOrder) pic
/* SEO slug for product_url (EntityNameId 6 = Product) */
OUTER APPLY (SELECT TOP 1 u.Slug FROM UrlRecord u
             WHERE u.EntityNameId = 6 AND u.EntityId = p.Id AND u.IsActive = 1 ORDER BY u.LanguageId) ur
/* units sold in last 90 days for the performance score */
LEFT JOIN (
  SELECT oi.ProductId, SUM(oi.Quantity) AS units_90d
  FROM OrderItem oi
  JOIN [Order] o ON o.Id = oi.OrderId AND o.StoreId = 2 AND o.Deleted = 0
                AND o.CreatedOnUtc >= DATEADD(day, -90, GETUTCDATE())
  GROUP BY oi.ProductId
) s ON s.ProductId = p.Id
WHERE p.Published = 1 AND p.Deleted = 0 AND p.VisibleIndividually = 1
  AND pic.PictureGuid IS NOT NULL                       -- rule 2: must have an image
  AND rc.root_name IS NOT NULL                          -- must have a real category
  AND tp.OldPrice > tp.Price                            -- has a markdown
  AND (tp.OldPrice - tp.Price) / tp.OldPrice BETWEEN 0.05 AND 0.90   -- sane discount band
ORDER BY (tp.OldPrice - tp.Price) / tp.OldPrice DESC;   -- richest discounts first
