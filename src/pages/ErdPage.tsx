import { useEffect, useRef, useState } from 'react'
import { Workbench } from '@/components/layout/Workbench'
import { ErdCanvas } from '@/features/erd/ErdCanvas'
import { useSqlStore } from '@/store/sqlStore'
import { Button } from '@/components/ui/button'
import { FileCode2 } from 'lucide-react'
import { useSeo, SrOnlyH1 } from '@/lib/seo'

const SAMPLE_DDL = `-- Mini e-commerce schema
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  sku VARCHAR(64) UNIQUE
);

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  total DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);`

export function ErdPage() {
  useSeo({
    title: 'SQL ERD Generator — Entity Relationship Diagram from DDL | SQL Explainer',
    description: 'Generate an interactive ERD / schema diagram from CREATE TABLE DDL or a SELECT query. Detects foreign keys and infers relationships. Export to PNG, SVG, or DBML. Free, client-side.',
  })
  const loadSample = useSqlStore((s) => s.loadSample)
  const [sampleChip, setSampleChip] = useState<{ onDismiss: () => void } | null>(null)
  const didInit = useRef(false)

  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    if (sessionStorage.getItem('erd-seen')) return
    sessionStorage.setItem('erd-seen', '1')
    if (!useSqlStore.getState().sql.trim()) {
      useSqlStore.getState().loadSample(SAMPLE_DDL)
      setSampleChip({ onDismiss: () => setSampleChip(null) })
    }
  }, [])

  const handleLoadSample = () => {
    loadSample(SAMPLE_DDL)
    setSampleChip({ onDismiss: () => setSampleChip(null) })
  }

  return (
    <>
      <SrOnlyH1>SQL ERD & Schema Diagram Generator</SrOnlyH1>
      <Workbench
        toolbar={
          <Button size="sm" variant="outline" onClick={handleLoadSample} title="Load a sample schema">
            <FileCode2 className="h-3.5 w-3.5" />
            Sample DDL
          </Button>
        }
        rightPanel={<ErdCanvas onLoadSample={handleLoadSample} sampleChip={sampleChip} />}
      />
    </>
  )
}
