import { NextResponse } from 'next/server';
import { GET as getForecastData } from '../kpi/forecast/data/route';

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        url.pathname = '/api/kpi/forecast/data';
        url.searchParams.set('tenantId', 'ALL');
        url.searchParams.set('year', '2026');
        url.searchParams.set('activeMonth', '6');
        
        const mockRequest = new Request(url.toString());
        const response = await getForecastData(mockRequest);
        const data = await response.json();
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}

