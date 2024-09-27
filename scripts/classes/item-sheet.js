import {ItemsWithSpells5e as IWS} from './defaults.js';
import {ItemsWithSpells5eItemSpellOverrides} from './item-spell-overrides.js';
import {ItemsWithSpells5eItem} from './item.js';

export {ItemsWithSpells5eItem} // to avoid a circular dependency

/**
 * A class made to make managing the operations for an Item sheet easier.
 */
export class ItemsWithSpells5eItemSheet {
  /** A boolean to set when we are causing an item update we know should re-open to this tab */
  _shouldOpenSpellsTab = false;

  constructor(app, [html]) {
    this.app = app;
    this.item = app.item;
    this.sheetHtml = html;
    this.itemWithSpellsItem = new ItemsWithSpells5eItem(this.item);
  }

  /** MUTATED: All open ItemSheet have a cached instance of this class */
  static instances = new Map();

  /**
   * Handles the item sheet render hooks.
   */
  static init() {
    Hooks.on('renderItemSheet', (app, html) => {
      // stop if item type is not included or this sheet is tidy5e
      if ( game.modules.get('tidy5e-sheet')?.api?.isTidy5eItemSheet(app) || !IWS.isIncludedItemType(app.item.type) ) return; // don't do this for tidy5e

      const instance = ItemsWithSpells5eItemSheet.instances.get(app.appId);
      if (instance) {
        instance.renderLite();
        if (instance._shouldOpenSpellsTab) {
          app._tabs?.[0]?.activate?.(IWS.MODULE_ID);
          instance._shouldOpenSpellsTab = false;
        }
        return;
      }
      const newInstance = new ItemsWithSpells5eItemSheet(app, html);
      ItemsWithSpells5eItemSheet.instances.set(app.appId, newInstance);
      return newInstance.renderLite();
    });

    // clean up instances as sheets are closed
    Hooks.on('closeItemSheet', async (app) => {
      const instance = ItemsWithSpells5eItemSheet.instances.get(app.appId);
      if (instance) {
        // Unlink all contained spells
        await instance._unlinkSpellSheets();
        // Close this instance
        return ItemsWithSpells5eItemSheet.instances.delete(app.appId);
      }
    });

    // tidy5e
    Hooks.once('tidy5e-sheet.ready', (api) => {
      const myTab = new api.models.HtmlTab({
        title: game.i18n.localize("TYPES.Item.spellPl"),
        tabId: IWS.MODULE_ID,
        html: '',
        enabled(data) {
          return IWS.isIncludedItemType(data.item.type);
        },
        onRender(params) {
          if (!IWS.isIncludedItemType(params.data.item.type)) return;
          let app = params.app;
          let html = [params.element];
          const instance = ItemsWithSpells5eItemSheet.instances.get(app.appId);
          if (instance) {
            instance.renderHeavy(params.tabContentsElement);
          } else {
            const newInstance = new ItemsWithSpells5eItemSheet(app, html);
            ItemsWithSpells5eItemSheet.instances.set(app.appId, newInstance);
            newInstance.renderHeavy(params.tabContentsElement);
          };
        }
      });
      api.registerItemTab(myTab, { autoHeight: true });
    });
  }

  /**
   * Renders the spell tab template to be injected
   */
  async _renderSpellsList() {
    await this.itemWithSpellsItem.refresh(); // Re-create the temporary spells every time
    const itemSpellsArray = [...(await this.itemWithSpellsItem.itemSpellItemMap).values()];

    // Link all contained spells to this one
    await this._linkSpellSheets();

    return renderTemplate(IWS.TEMPLATES.spellsTab, {
      itemSpells: itemSpellsArray,
      config: {
        limitedUsePeriods: CONFIG.DND5E.limitedUsePeriods,
        abilities: CONFIG.DND5E.abilities,
      },
      isEmbedded: this.item.isEmbedded,
      isOwner: this.item.isOwner,
      concealDetails: !game.user.isGM && (this.item.system.identified === false)
    });
  }

  /**
   * Ensure the item dropped is a spell, add the spell to the item flags.
   * @returns Promise that resolves when the item has been modified
   */
  async _dragEnd(event) {
    if (!this.app.isEditable) return;
    const data = TextEditor.getDragEventData(event);
    if (data.type !== 'Item') return;
    const item = await fromUuid(data.uuid);
    if (item.type !== 'spell') return;
    // set the flag to re-open this tab when the update completes
    this._shouldOpenSpellsTab = true;
    return this.itemWithSpellsItem.addSpellToItem(data.uuid);
  }

  /**
   * Event Handler that opens the item's sheet
   */
  async _handleItemClick(event) {
    const spellId = event.currentTarget.closest("[data-item-id]").dataset.itemId;
    const spell = this.itemWithSpellsItem.itemSpellItemMap.get(spellId);
    if (this.item.isEmbedded) {
      fromUuidSync(spell.uuid).use({ event });
    } else {
      spell?.sheet.render(true, {editable: false});
    }
  }

  /**
   * Event Handler that opens the item's sheet to edit
   */
  async _handleItemEditClick(event) {
    const spellId = event.currentTarget.closest("[data-item-id]").dataset.itemId;
    const spellTemp = this.itemWithSpellsItem.itemSpellItemMap.get(spellId);
    let spell = spellTemp;
    if (!spellTemp.isEmbedded) {
      const spellUuid = spellTemp.getFlag(IWS.MODULE_ID, IWS.FLAGS.knownUuid);
      spell = await fromUuid(spellUuid); // could be from a compendium
    }
    spell?.sheet.render(true);
  }

  /**
   * Event Handler that removes the link between this item and the spell
   */
  async _handleItemDeleteClick(event) {
    const itemId = event.currentTarget.closest("[data-item-id]").dataset.itemId;
    // set the flag to re-open this tab when the update completes
    this._shouldOpenSpellsTab = true;
    return this.itemWithSpellsItem.removeSpellFromItem(itemId);
  }

  /**
   * Event Handler that also Deletes the embedded spell
   */
  async _handleItemDestroyClick(event) {
    const itemId = event.currentTarget.closest("[data-item-id]").dataset.itemId;
    // set the flag to re-open this tab when the update completes
    this._shouldOpenSpellsTab = true;
    return this.itemWithSpellsItem.removeSpellFromItem(itemId, {alsoDeleteEmbeddedSpell: true});
  }

  /**
   * Event Handler that opens the spell's sheet or config overrides, depending on if the item is owned
   */
  async _handleOverridesConfigureClick(event) {
    const spellId = event.currentTarget.closest("[data-item-id]").dataset.itemId;
    const spell = this.itemWithSpellsItem.itemSpellItemMap.get(spellId);
    if (this.item.isEmbedded) {
      // NOG AANPASSEN: zodat overrides ook op embedded spells kunnen worden toegepast
      return fromUuidSync(spell.uuid).sheet.render(true);
    } else if (spell.sheet.rendered) {
      // For temporary items, close any open sheet as the configure will create a new temporary item
      spell.sheet.close();
    }
    // pop up a form dialog to configure this item's overrides
    return new ItemsWithSpells5eItemSpellOverrides(this.itemWithSpellsItem, spellId).render(true);
  }

  /**
   * Synchronous part of the render which calls the asynchronous `renderHeavy`
   * This allows for less delay during the update -> renderItemSheet -> set tab cycle
   */
  renderLite() {
    // Update the nav menu
    const div = document.createElement("DIV");
    div.innerHTML = `<a class="item" data-tab="${IWS.MODULE_ID}">${game.i18n.localize("TYPES.Item.spellPl")}</a>`;
    const tabs = this.sheetHtml.querySelector(".tabs[data-group=primary]");
    if (!tabs) return;
    tabs.appendChild(div.firstElementChild);

    // Create the tab
    const sheetBody = this.sheetHtml.querySelector(".sheet-body");
    div.innerHTML = `<div class="tab ${IWS.MODULE_ID}" data-group="primary" data-tab="${IWS.MODULE_ID}"></div>`;
    const c = div.firstElementChild;
    sheetBody.appendChild(c);
    this.renderHeavy(c);
  }

  /**
   * Heavy lifting part of the spells tab rendering which involves getting the spells and painting them.
   * @param {HTMLElement} spellsTab
   */
  async renderHeavy(spellsTab) {
    // Add the list to the tab
    const div = document.createElement("DIV");
    div.innerHTML = await this._renderSpellsList();
    const c = div.firstElementChild;
    spellsTab.appendChild(c);

    // Activate Listeners for this ui.
    c.querySelectorAll(".item-name").forEach(n => n.addEventListener("click", this._handleItemClick.bind(this)));
    c.querySelectorAll(".configure-overrides").forEach(n => n.addEventListener("click", this._handleOverridesConfigureClick.bind(this)));
    c.querySelectorAll(".item-edit").forEach(n => n.addEventListener("click", this._handleItemEditClick.bind(this)));
    c.querySelectorAll(".item-delete").forEach(n => n.addEventListener("click", this._handleItemDeleteClick.bind(this)));
    c.querySelectorAll(".item-destroy").forEach(n => n.addEventListener("click", this._handleItemDestroyClick.bind(this)));

    // Register a DragDrop handler for adding new spells to this item
    const dragDrop = {
      dragSelector: ".item",
      dropSelector: `.${IWS.MODULE_ID}`,
      permissions: {drop: () => this.app.isEditable && !this.item.isEmbedded},
      callbacks: {drop: this._dragEnd},
    };
    spellsTab.addEventListener("drop", dragDrop.callbacks.drop.bind(this));
  }

  /**
   * Link the sheets of linked spells so that updating them updates this item sheet as well
   */
  async _linkSpellSheets() {
    return Promise.all(
      this.itemWithSpellsItem.itemSpellList.map(async ({uuid, overrides}) => {
        const spell = await fromUuid(uuid);
        if (spell) spell.apps[this.app.appId] = this.app;
        return spell;
      })
    );
  }

  /**
   * Link the sheets of linked spells so that updating them updates this item sheet as well
   */
  async _unlinkSpellSheets() {
    return Promise.all(
      this.itemWithSpellsItem.itemSpellList.map(async ({uuid, overrides}) => {
        const spell = await fromUuid(uuid);
        if (spell.apps[this.app.appId]) delete spell.apps[this.app.appId];
        return spell;
      })
    );
  }
}
