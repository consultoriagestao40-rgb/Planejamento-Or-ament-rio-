import { NextResponse } from 'next/server';
import { GET as getContracts } from '../kpi/forecast/contracts/route';
import { GET as getCoefficients } from '../kpi/forecast/coefficients/route';
import { GET as getData } from '../kpi/forecast/data/route';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const reqC = new Request('http://localhost/api/kpi/forecast/contracts?tenantId=ALL&year=2026');
        const resC = await getContracts(reqC);
        const jsonC = await resC.json();

        const reqCoef = new Request('http://localhost/api/kpi/forecast/coefficients?tenantId=ALL&year=2026');
        const resCoef = await getCoefficients(reqCoef);
        const jsonCoef = await resCoef.json();

        const reqData = new Request('http://localhost/api/kpi/forecast/data?tenantId=ALL&year=2026&activeMonth=6');
        const resData = await getData(reqData);
        const jsonData = await resData.json();

        return NextResponse.json({
            success: true,
            contracts: {
                success: jsonC.success,
                count: jsonC.data?.length || 0,
                error: jsonC.error || null,
                sample: jsonC.data?.slice(0, 2) || []
            },
            coefficients: {
                success: jsonCoef.success,
                count: jsonCoef.data?.length || 0,
                error: jsonCoef.error || null,
                sample: jsonCoef.data?.slice(0, 2) || []
            },
            data: {
                success: jsonData.success,
                count: jsonData.data?.length || 0,
                error: jsonData.error || null,
                sample: jsonData.data?.slice(0, 2) || []
            }
        });
    } catch (e: any) {
        return NextResponse.json({
            success: false,
            error: e.message
        });
    }
}
