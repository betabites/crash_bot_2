export enum NotificationType {
    ItemAvailableAtVendor
}

export interface NotificationDefinition {
    id: number,
    type: NotificationType,
    vendor_hash: number,
    activity_hash: number
}