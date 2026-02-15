
interface ContaAzulTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

// URL atualizada conforme portal do desenvolvedor da Conta Azul
const CA_AUTH_URL = 'https://auth.contaazul.com/login';
const CA_TOKEN_URL = 'https://api.contaazul.com/oauth2/token'; // Manteremos este por enquanto

export const getAuthUrl = (state: string) => {
    // Configuração Hardcoded (Prioridade sobre Env Vars para evitar conflitos na Vercel)
    const clientId = '4obnij6ehp1q45oecojivdta7n'.trim();
    // const clientSecret não é usado aqui

    // Define a URL de callback dinamicamente baseada no ambiente
    const isDev = process.env.NODE_ENV === 'development';
    // Conta Azul pode rejeitar 'localhost', então usamos 127.0.0.1
    const baseUrl = isDev ? 'http://127.0.0.1:3000' : 'https://planejamento-or-ament-rio.vercel.app';
    const redirectUri = `${baseUrl}/api/auth/callback`;

    // Scope atualizado: Novo padrão da Conta Azul (Cognito)
    const scope = 'openid profile email offline_access aws.cognito.signin.user.admin';

    return `${CA_AUTH_URL}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&response_type=code`;
};

export const exchangeCodeForToken = async (code: string): Promise<ContaAzulTokenResponse> => {
    const clientId = '4obnij6ehp1q45oecojivdta7n'.trim();
    const clientSecret = '1nhd3b2mu9hoo6o2qkhr7unn376m5lets1gvfdcd7lkie5vpoo49'.trim();

    const isDev = process.env.NODE_ENV === 'development';
    const baseUrl = isDev ? 'http://127.0.0.1:3000' : 'https://planejamento-or-ament-rio.vercel.app';
    const redirectUri = `${baseUrl}/api/auth/callback`;

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
    // HARDCODED: Garantindo consistência com o restante do arquivo
    const clientId = '4obnij6ehp1q45oecojivdta7n'.trim();
    const clientSecret = '1nhd3b2mu9hoo6o2qkhr7unn376m5lets1gvfdcd7lkie5vpoo49'.trim();

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
