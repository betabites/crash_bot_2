import {InventoryItem} from "./InventoryItem.ts";

/**
 * A bucket refers to an item in a user's inventory that can have other items nested within it.
 */
export abstract class Bucket extends InventoryItem<{}> {
    setBucketId(bucketId: string | null) {}
}
