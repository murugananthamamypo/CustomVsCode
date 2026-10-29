/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const API_URLS = [
    'https://endpoint.amypo.ai/api',
    'https://1102amy21.amypo.ai/api'
];

let cachedExtensions: string[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 30 * 1000;

import { INotificationService } from '../../../../platform/notification/common/notification.js';

export class AmypoExtensionService {

    static async getRecommendedExtensions(
        langId: number,
        token: string,
        _notificationService?: INotificationService
    ): Promise<string[]> {

        const now = Date.now();
        if (cachedExtensions !== null && (now - cacheTimestamp) < CACHE_TTL) {
            console.log('[Amypo Extension] Returning cached extensions:', cachedExtensions);
            return cachedExtensions;
        }

        // ✅ Print lang_id and token
        console.log('========================================');
        console.log('[Amypo Extension] Lang ID    :', langId);
        console.log('[Amypo Extension] Token      :', token ? token.substring(0, 20) + '...' : '❌ MISSING');
        console.log('========================================');

        if (!langId || !token) {
            console.log('[Amypo Extension] ❌ No langId or token — skipping');
            return [];
        }

        for (const baseUrl of API_URLS) {
            try {
                const url = `${baseUrl}/project-get-extension/${langId}`;
                console.log('[Amypo Extension] Fetching URL:', url);

                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);

                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    signal: controller.signal
                });

                clearTimeout(timeout);

                if (!response.ok) {
                    console.warn(`[Amypo Extension] ${url} returned status ${response.status}. Trying fallback if available...`);
                    continue;
                }

                const resp = await response.json();
                const rawResponseStr = JSON.stringify(resp);
                console.log('[Amypo Extension] Raw response:', rawResponseStr);

                if (resp && resp.data && Array.isArray(resp.data.extension)) {
                    // Use IDs directly from the server (fully dynamic)
                    const extensionIds: string[] = resp.data.extension.map((id: string) => id.trim());

                    // ✅ Print extension details
                    console.log('========================================');
                    console.log('[Amypo Extension] Language     :', resp.data.language_name);
                    console.log('[Amypo Extension] Total count  :', extensionIds.length);
                    console.log('[Amypo Extension] Extension IDs:');
                    extensionIds.forEach((id, index) => {
                        console.log(`  ${index + 1}. ${id}`);
                    });
                    console.log('========================================');

                    cachedExtensions = extensionIds;
                    cacheTimestamp = Date.now();
                    return extensionIds;
                }

                console.log('[Amypo Extension] ❌ No extensions array found in data');
            } catch (err) {
                console.warn(`[Amypo Extension] Request failed for ${baseUrl}:`, err);
            }
        }

        console.warn('[Amypo Extension] ❌ Could not retrieve recommended extensions from any endpoint');
        return [];
    }

    static clearCache(): void {
        cachedExtensions = null;
        cacheTimestamp = 0;
        console.log('[Amypo] Cache cleared');
    }
}

export function clearAmypoExtensionCache(): void {
    AmypoExtensionService.clearCache();
}
