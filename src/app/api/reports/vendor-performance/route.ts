"use server";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActorFromToken, isAdmin } from '@/lib/auth';

function toCsv(rows: string[][]) {
    return rows.map(r => r.map(cell => {
        if (cell == null) return '';
        const s = String(cell).replace(/"/g, '""');
        return `"${s}"`;
    }).join(',')).join('\n');
}

export async function GET(request: Request) {
    try {
        const actor = await getActorFromToken(request);
        if (!isAdmin(actor) && !(actor.roles || []).includes('Procurement_Officer')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const url = new URL(request.url);
        const startParam = url.searchParams.get('start');
        const endParam = url.searchParams.get('end');
        const format = url.searchParams.get('format') || 'json';

        const end = endParam ? new Date(endParam) : new Date();
        const start = startParam ? new Date(startParam) : new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);

        const vendors = await prisma.vendor.findMany({ select: { id: true, name: true } });

        const results: any[] = [];

        // load blacklist settings for vendors
        const vendorIds = vendors.map(v => v.id);
        const blacklistKeys = vendorIds.map(id => `vendor:blacklist:${id}`);
        const blacklistSettings = await prisma.setting.findMany({ where: { key: { in: blacklistKeys } } });
        const blacklistMap: Record<string, any> = {};
        for (const s of blacklistSettings) {
            try {
                const parts = s.key.split(':');
                const vendorId = parts.slice(2).join(':');
                blacklistMap[vendorId] = s.value;
            } catch (e) { }
        }

        for (const v of vendors) {
            const poRows = await prisma.purchaseOrder.findMany({ where: { vendorId: v.id, createdAt: { gte: start, lte: end } }, select: { totalAmount: true, status: true, createdAt: true } });
            const poCount = poRows.length;
            const totalSpend = poRows.reduce((s, p) => s + (p.totalAmount || 0), 0);
            const avgPoValue = poCount ? totalSpend / poCount : null;

            const quotationRows = await prisma.quotation.findMany({ where: { vendorId: v.id, createdAt: { gte: start, lte: end } }, select: { id: true, finalAverageScore: true } });
            const quotationCount = quotationRows.length;
            const avgQuotationScore = quotationCount ? (quotationRows.reduce((s, q) => s + (q.finalAverageScore || 0), 0) / quotationCount) : null;

            // On-time delivery: percent of POs marked Fulfilled in the period
            const fulfilledCount = poRows.filter(p => p.status === 'Fulfilled').length;
            const onTimePercent = poCount ? (fulfilledCount / poCount) * 100 : null;

            // Simple performance score: weighted average of quotation score and on-time %
            const qScore = avgQuotationScore != null ? avgQuotationScore : 0;
            const ot = onTimePercent != null ? onTimePercent : 0;
            const performanceScore = (qScore * 0.6) + (ot * 0.4);

            results.push({
                vendorId: v.id,
                vendorName: v.name,
                totalSpend,
                poCount,
                averagePoValue: avgPoValue,
                quotationCount,
                averageQuotationScore: avgQuotationScore,
                onTimeDeliveryPercent: onTimePercent,
                performanceScore,
                blacklist: blacklistMap[v.id] || null,
            });
        }

        // Rank vendors by performanceScore desc
        results.sort((a, b) => (b.performanceScore || 0) - (a.performanceScore || 0));
        results.forEach((r, idx) => r.vendorRank = idx + 1);

        if (format === 'csv') {
            const rows: string[][] = [
                ['Vendor ID', 'Vendor Name', 'Total Spend', 'PO Count', 'Average PO Value', 'Quotation Count', 'Average Quotation Score', 'On-Time Delivery %', 'Performance Score', 'Blacklisted', 'Vendor Rank']
            ];
            for (const r of results) {
                rows.push([
                    r.vendorId,
                    r.vendorName,
                    String(r.totalSpend ?? ''),
                    String(r.poCount ?? ''),
                    r.averagePoValue == null ? '' : String(r.averagePoValue),
                    String(r.quotationCount ?? ''),
                    r.averageQuotationScore == null ? '' : String(r.averageQuotationScore),
                    r.onTimeDeliveryPercent == null ? '' : String(r.onTimeDeliveryPercent.toFixed(2)),
                    r.performanceScore == null ? '' : String(r.performanceScore.toFixed(2)),
                    r.blacklist && (r.blacklist.blacklisted === true || r.blacklist.status === 'blacklisted') ? 'Yes' : 'No',
                    String(r.vendorRank)
                ]);
            }
            return new NextResponse(toCsv(rows), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="vendor-performance.csv"' } });
        }

        return NextResponse.json({ period: { start: start.toISOString(), end: end.toISOString() }, vendors: results });
    } catch (err) {
        console.error('Failed to compute vendor performance', err);
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
}
