-- Development/staging sample data only. Production launch must reject is_sample = 1.
INSERT OR IGNORE INTO products (id,slug,title,description,category,price_kobo,status,is_sample,preparation_min_days,preparation_max_days,preparation_day_basis,preparation_trigger,created_at,updated_at) VALUES
('sample-001','amara-drape-dress','Amara Drape Dress','Sample description','Dresses',9200000,'published',1,12,16,'business','verified_payment',datetime('now'),datetime('now')),
('sample-002','ivie-tailored-set','Ivie Tailored Set','Sample description','Sets',11000000,'published',1,14,18,'business','verified_payment',datetime('now'),datetime('now')),
('sample-003','zuri-wrap-gown','Zuri Wrap Gown','Sample description','Occasion',7800000,'published',1,10,14,'business','verified_payment',datetime('now'),datetime('now')),
('sample-004','sade-column-dress','Sade Column Dress','Sample description','Dresses',8600000,'published',1,12,16,'business','verified_payment',datetime('now'),datetime('now')),
('sample-005','kosi-sculpted-top','Kosi Sculpted Top','Sample description','Separates',4700000,'published',1,8,12,'business','verified_payment',datetime('now'),datetime('now')),
('sample-006','eniola-wide-trouser','Eniola Wide Trouser','Sample description','Separates',5200000,'published',1,8,12,'business','verified_payment',datetime('now'),datetime('now')),
('sample-007','naya-satin-dress','Naya Satin Dress','Sample description','Occasion',9500000,'published',1,14,18,'business','verified_payment',datetime('now'),datetime('now')),
('sample-008','ada-soft-jacket','Ada Soft Jacket','Sample description','Separates',6800000,'published',1,10,15,'business','verified_payment',datetime('now'),datetime('now')),
('sample-009','tomi-skirt-set','Tomi Skirt Set','Sample description','Sets',10200000,'published',1,12,17,'business','verified_payment',datetime('now'),datetime('now')),
('sample-010','lola-pleated-dress','Lola Pleated Dress','Sample description','Dresses',8900000,'published',1,11,15,'business','verified_payment',datetime('now'),datetime('now'));
WITH sizes(size,capacity) AS (VALUES('XS',5),('S',8),('M',8),('L',6),('XL',4))
INSERT OR IGNORE INTO variants (id,product_id,sku,size,colour,capacity,reserved_quantity,committed_quantity,preorder_open)
SELECT p.id||'-'||lower(s.size),p.id,'HLY-'||substr(p.id,-3)||'-'||s.size,s.size,CASE WHEN p.id IN('sample-002','sample-005','sample-010') THEN 'Deep olive' WHEN p.id IN('sample-003','sample-007','sample-009') THEN 'Cocoa' ELSE 'Cream' END,s.capacity,0,0,1 FROM products p CROSS JOIN sizes s WHERE p.is_sample=1;

INSERT OR IGNORE INTO product_images (id,product_id,object_key,alt_text,sort_order,is_cover,created_at) VALUES
('image-001','sample-001','public:hero-cream.png#sample-001','Sample editorial photograph for Amara Drape Dress',0,1,datetime('now')),
('image-002','sample-002','public:look-olive.png#sample-002','Sample editorial photograph for Ivie Tailored Set',0,1,datetime('now')),
('image-003','sample-003','public:flatlay-cocoa.png#sample-003','Sample editorial photograph for Zuri Wrap Gown',0,1,datetime('now')),
('image-004','sample-004','public:hero-cream.png#sample-004','Sample editorial photograph for Sade Column Dress',0,1,datetime('now')),
('image-005','sample-005','public:look-olive.png#sample-005','Sample editorial photograph for Kosi Sculpted Top',0,1,datetime('now')),
('image-006','sample-006','public:look-olive.png#sample-006','Sample editorial photograph for Eniola Wide Trouser',0,1,datetime('now')),
('image-007','sample-007','public:flatlay-cocoa.png#sample-007','Sample editorial photograph for Naya Satin Dress',0,1,datetime('now')),
('image-008','sample-008','public:hero-cream.png#sample-008','Sample editorial photograph for Ada Soft Jacket',0,1,datetime('now')),
('image-009','sample-009','public:flatlay-cocoa.png#sample-009','Sample editorial photograph for Tomi Skirt Set',0,1,datetime('now')),
('image-010','sample-010','public:look-olive.png#sample-010','Sample editorial photograph for Lola Pleated Dress',0,1,datetime('now'));

INSERT OR IGNORE INTO delivery_zones (id,name,fee_kobo,transit_min_days,transit_max_days,active)
VALUES ('lagos','Lagos',500000,2,5,1);
