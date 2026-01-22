interface ContaAzulTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

const CA_AUTH_URL = 'https://api.contaazul.com/auth/authorize';
const CA_TOKEN_URL = 'https://api.contaazul.com/oauth2/token';

export const getAuthUrl = (state: string) => {
    // HARDCODED DEBUGGING - CREDENCIAIS NOVAS (APP V2)
    const clientId = '3umvfmnhich3uk9hql7am59jgq';
    const redirectUri = 'https://planejamento-or-ament-rio.vercel.app/api/auth/callback';

    // Scopes based on requirements: Financial read
    const scope = 'sales'; // Adjust scope as needed based on specific endpoints

    return `${CA_AUTH_URL}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&response_type=code`;
};

export const exchangeCodeForToken = async (code: string): Promise<ContaAzulTokenResponse> => {
    const clientId = '3umvfmnhich3uk9hql7am59jgq';
    const clientSecret = '1cviq3vpls9telc4pm89dilldm9o2fo7ac9pvnarr4lg6201see0';
    const redirectUri = 'https://planejamento-or-ament-rio.vercel.app/api/auth/callback';

    const response = await fetch(CA_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri!,
            client_id: clientId!,
            client_secret: clientSecret!
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to exchange token: ${errorBody}`);
    }

    return response.json();
};

export const refreshAccessToken = async (refreshToken: string): Promise<ContaAzulTokenResponse> => {
    const clientId = process.env.CONTA_AZUL_CLIENT_ID;
    const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(CA_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to refresh token: ${errorBody}`);
    }

    return response.json();
};
