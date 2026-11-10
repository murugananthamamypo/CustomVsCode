/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { AmypoExtensionService } from './amypoExtensionService.js';

export async function getAmypoRecommendedExtensions(
    langId: number,
    token: string,
    notificationService?: INotificationService,
    serverType?: string
): Promise<string[]> {
    return await AmypoExtensionService.getRecommendedExtensions(
        langId,
        token,
        notificationService,
        serverType
    );
}

export function clearAmypoExtensionCache(): void {
    AmypoExtensionService.clearCache();
}
