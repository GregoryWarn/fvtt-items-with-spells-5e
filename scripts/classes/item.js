import {ItemsWithSpells5e as IWS} from './defaults.js';
import {ItemsWithSpells5eItemSheet} from './item-sheet.js';

/**
 * Creates a fake temporary item as filler for when a UUID is unable to resolve an item
 * @param {string} uuid - the `uuid` of the source of this item
 * @returns item with the correct flags to allow deletion
 */
const FakeEmptySpell = (uuid, parent) =>
  new Item.implementation(
    {
      name: game.i18n.localize("IWS.MISSING_ITEM.Name"),
      img: 'icons/svg/hazard.svg',
      type: 'spell',
      system: {
        description: {
          value: game.i18n.localize("IWS.MISSING_ITEM.Description"),
        }
      },
      _id: uuid.split('.').pop()
    },
    {
      temporary: true,
      parent
    }
  );

/**
 * A class made to make managing the operations for an Item with spells attached easier.
 */
export class ItemsWithSpells5eItem {
  constructor(item) {
    this.item = item;

    this._itemSpellFlagMap = null;
    this._itemSpellItems = null;
  }

  /**
   * A map of what the "id" of the new spell would be to its corresponding flag definition on this parent item
   * Used when updating an item's overrides as the map lookup is easier than the array lookup
   */
  get itemSpellFlagMap() {
    if (this._itemSpellFlagMap === null) {
      return this._getItemSpellFlagMap();
    }

    return this._itemSpellFlagMap;
  }

  /**
   * Raw flag data
   */
  get itemSpellList() {
    return this.item.getFlag(IWS.MODULE_ID, IWS.FLAGS.itemSpells) ?? [];
  }

  /**
   * A map of what the "id" of the New spell would be to its corresponding Item Data, taking any defined overrides into account.
   */
  get itemSpellItemMap() {
    if (this._itemSpellItems === null) {
      return this._getItemSpellItems();
    }

    return this._itemSpellItems;
  }

  /**
   * Update this class's understanding of the item spells
   */
  async refresh() {
    this._getItemSpellFlagMap();
    await this._getItemSpellItems();
  }

  /**
   * Gets the child item from its uuid and provided overrides.
   * If the uuid points to an item already created on the actor: return that item.
   * Otherwise create a temporary item, apply overrides, and return that item's json.
   */
  async _getChildItem({uuid, overrides = {}}) {
    // original could be in a compendium or on an actor
    let original = await fromUuid(uuid);

    // If this 'child' spell has been created on an actor, return that
    if ([this.item.id, this.item.uuid].includes(IWS.getSpellParentId(original))) {
      return original;
    }

    // Create a fake 'empty' item if we could not find the 'child' spell
    if (!original) {
      original = FakeEmptySpell(uuid, this.item.parent);
    }

    // Convert the overrides object into a usable update object
    const update = IWS.createUpdateObject(this.item, original, overrides);

    // Save the uuid of how the spell is stored in the parentItem's flags into the temporary spell object, so that we know which is its original
    update[`flags.${IWS.MODULE_ID}.${IWS.FLAGS.knownUuid}`] = uuid;

    const childItem = new Item.implementation(original.toObject(), {
      temporary: true,
      keepId: false,
      parent: this.item.parent
    });
    await childItem.updateSource(update);

    return childItem;
  }

  /**
   * Get a cached copy of temporary items or create and cache those items with the overrides from flags applied.
   * @returns {Promise<Map<string, Item5e>>} - array of temporary items created from the uuids and overrides attached to this item
   */
  async _getItemSpellItems() {
    const itemMap = new Map();

    await Promise.all(
      this.itemSpellList.map(async ({uuid, overrides}) => {
        const childItem = await this._getChildItem({uuid, overrides});

        if (!childItem) return;

        itemMap.set(childItem.id, childItem);
        return childItem;
      })
    );

    this._itemSpellItems = itemMap;
    return itemMap;
  }

  /**
   * Get or Create a cached map of child spell item "ids" to their flags
   * Useful when updating overrides for a specific 'child spell'
   * @returns {Map<string, object>} - Map of ids to flags
   */
  _getItemSpellFlagMap() {
    const map = new Map();
    this.itemSpellList.forEach((itemSpellFlag) => {
      const id = itemSpellFlag.uuid.split('.').pop();
      map.set(id, itemSpellFlag);
    });
    this._itemSpellFlagMap = map;
    return map;
  }

  /**
   * Adds a given UUID to the item's spell list
   * @param {string} providedUuid
   */
  async addSpellToItem(providedUuid) {
    // MUTATED if this is an owned item
    let uuid = providedUuid;

    if (this.item.isEmbedded) {
      // if this item is already on an actor, we need to
      // 0. see if the uuid is already on the actor
      // 1. create the dropped spell on the Actor's item list
      // 2. get the new uuid from the created spell
      // 3. add that spell's uuid to this item's flags
      const spell = await fromUuid(uuid);

      if (!spell) {
        ui.notifications.error('Item data for', uuid, 'not found');
        return;
      }
      const update = IWS.createUpdateObject(this.item, spell); // the default overrides
      const adjustedItemData = foundry.utils.mergeObject(spell.toObject(), update);

      const [newItem] = await this.item.actor.createEmbeddedDocuments('Item', [adjustedItemData]);
      uuid = newItem.uuid;
    }

    // Update the flag with the linked spells, but don't re-render the item sheet because we need to wait until we refresh to do so
    const itemSpells = [...this.itemSpellList, {uuid}];
    const property = `flags.${IWS.MODULE_ID}.${IWS.FLAGS.itemSpells}`;
    await this.item.update({[property]: itemSpells}, {render: false});
    // Refresh the itemSpellList and 
    await this.refresh();

    // now re-render the item and actor sheets
    this.item.render();
    if (this.item.actor) this.item.actor.render();
  }

  /**
   * Removes the relationship between the provided item and this item's spells
   * @param {string} itemId - the id of the item to remove
   * @param {Object} options
   * @param {boolean} [options.alsoDeleteEmbeddedSpell] - Should the spell be deleted also, only for owned items
   * @returns {Item} the updated or deleted spell after having its parent item removed, or null
   */
  async removeSpellFromItem(itemId, {alsoDeleteEmbeddedSpell} = {}) {
    const itemToDelete = this.itemSpellItemMap.get(itemId);

    // If a sheet for a temporary item is open, close that window
    if (!this.item.isEmbedded && itemToDelete.sheet.rendered) itemToDelete.sheet.close();

    // If owned, we are storing the actual owned spell item's uuid. Else we stored the source id.
    const uuidToRemove = this.item.isEmbedded ? itemToDelete.uuid : itemToDelete.getFlag(IWS.MODULE_ID, IWS.FLAGS.knownUuid);
    const newItemSpells = this.itemSpellList.filter(({uuid}) => uuid !== uuidToRemove);

    // update the data manager's internal store of the items it contains
    this._itemSpellItems?.delete(itemId);
    this._itemSpellFlagMap?.delete(itemId);

    await this.item.setFlag(IWS.MODULE_ID, IWS.FLAGS.itemSpells, newItemSpells);

    // Nothing more to do for unowned items.
    if (!this.item.isEmbedded) return;

    // remove the spell's `parentItem` flag
    const spellItem = fromUuidSync(uuidToRemove);

    // the spell has already been deleted, so do nothing
    if (!spellItem) return;

    const shouldDeleteSpell = alsoDeleteEmbeddedSpell && (await Dialog.confirm({
      title: game.i18n.localize("IWS.MODULE_NAME"),
      content: game.i18n.localize("IWS.DIALOG.DeleteOrphanedSpells")
    }));

    if (shouldDeleteSpell) return spellItem.delete();
    else return spellItem.unsetFlag(IWS.MODULE_ID, IWS.FLAGS.parentItem);
  }

  /**
   * Updates the given item's overrides
   * @param {*} itemId - spell attached to this item
   * @param {*} overrides - object describing what should be changed in the spell
   */
  async updateItemSpellOverrides(itemId, overrides) {
    const itemSpellFlagsToUpdate = this.itemSpellFlagMap.get(itemId);
    itemSpellFlagsToUpdate.overrides = overrides;
    this.itemSpellFlagMap.set(itemId, itemSpellFlagsToUpdate);
    const newItemSpellsFlagValue = [...this.itemSpellFlagMap.values()];

    // this update should not re-render the item sheet because we need to wait until we refresh to do so
    await this.item.update({[`flags.${IWS.MODULE_ID}.${IWS.FLAGS.itemSpells}`]: newItemSpellsFlagValue}, {render: false});

    // update this data manager's understanding of the items it contains
    await this.refresh();

    // now re-render the item sheets
    this.item.render();
  }

  /**
   * For API - Get the spells of an item
   * @public
   * @param {Item5e[]} item The item to get the attached spells from
   * @param {boolean} embeddedOnly Only return the items owned by the same actor
   * @param {Map} providedItems Only return spells included in these items (e.g. pass actor.items)
   * @returns Map of the items or `null` if item has no spells attached.
   * Also `null` if embeddedOnly is true and item is not owned by an actor
   */
  static async getItemSpells(item, embeddedOnly = false, providedItems = false) {
    if (typeof item === "string") item = await fromUuid(item);
    if (embeddedOnly && !item.isEmbedded) return null;
    const ItemsWithSpellsItem = new ItemsWithSpells5eItem(item);
    if (!ItemsWithSpellsItem.itemSpellList.length) return null;
    const items = providedItems ?? embeddedOnly ? item.actor?.items : false;
    if (embeddedOnly && !items) {
      return null;
    } else if (items) {
      const spells = new Map();
      const itemIds = [item.id ?? item._id, item.uuid];
      items.forEach(spell => {
        const parentId = IWS.getSpellParentId(spell);
        if (itemIds.includes(parentId)) spells.set(spell.id, spell);
      });
      return spells;
    } else {
      return await ItemsWithSpellsItem.itemSpellItemMap;
    }
  }
}
