/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const API_URL = 'https://endpoint.amypo.ai/api';

let cachedExtensions: string[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 30 * 1000;




import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';

export class AmypoExtensionService {

    static async getRecommendedExtensions(
        langId: number,
        token: string,
        notificationService?: INotificationService
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

        try {
            const url = `${API_URL}/project-get-extension/${langId}`;
            console.log('[Amypo Extension] Fetching URL:', url);

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const errorMsg = `Server error: ${response.status}`;
                notificationService?.error(`[Amypo Extension] ${errorMsg}`);
                throw new Error(errorMsg);
            }

            const resp = await response.json();
            const rawResponseStr = JSON.stringify(resp);
            console.log('[Amypo Extension] Raw response:', rawResponseStr);

            // ✅ Show Notification with raw response
            if (notificationService) {
                notificationService.notify({
                    severity: Severity.Info,
                    message: `[Amypo Extension] Raw response: ${rawResponseStr}`,
                    sticky: false
                });
            }

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

            console.log('[Amypo Extension] ❌ No extensions in response');
            return [];

        } catch (err) {
            console.error('[Amypo Extension] ❌ Failed:', err);
            return [];
        }
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
