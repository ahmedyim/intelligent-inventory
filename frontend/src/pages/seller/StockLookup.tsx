import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

type StockItem = {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    price: number;
};

// TODO: replace this sample data with your real API call
// (e.g. an RTK Query hook or axios request that returns the seller's stock).
const SAMPLE_STOCK: StockItem[] = [
    { id: '1', name: 'Laptop Charger', sku: 'LC-001', quantity: 24, price: 35 },
    { id: '2', name: 'Wireless Mouse', sku: 'WM-014', quantity: 3, price: 12 },
    { id: '3', name: 'USB-C Cable', sku: 'UC-220', quantity: 0, price: 6 },
];

export default function StockLookup() {
    const [query, setQuery] = useState('');

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return SAMPLE_STOCK;
        return SAMPLE_STOCK.filter(
            (item) =>
                item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q),
        );
    }, [query]);

    const statusOf = (qty: number) => {
        if (qty === 0) return { label: 'Out of stock', className: 'text-red-600' };
        if (qty <= 5) return { label: 'Low stock', className: 'text-orange-600' };
        return { label: 'In stock', className: 'text-green-600' };
    };

    return (
        <div className="space-y-4 p-4">
            <div>
                <h1 className="text-2xl font-semibold">Stock Lookup</h1>
                <p className="text-sm text-muted-foreground">
                    Search by product name or SKU to check availability.
                </p>
            </div>

            <Input
                placeholder="Search product or SKU..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="max-w-sm"
            />

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead>Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {results.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground">
                                No products found.
                            </TableCell>
                        </TableRow>
                    ) : (
                        results.map((item) => {
                            const status = statusOf(item.quantity);
                            return (
                                <TableRow key={item.id}>
                                    <TableCell className="font-medium">{item.name}</TableCell>
                                    <TableCell>{item.sku}</TableCell>
                                    <TableCell className="text-right">{item.quantity}</TableCell>
                                    <TableCell className="text-right">${item.price}</TableCell>
                                    <TableCell className={status.className}>{status.label}</TableCell>
                                </TableRow>
                            );
                        })
                    )}
                </TableBody>
            </Table>
        </div>
    );
}