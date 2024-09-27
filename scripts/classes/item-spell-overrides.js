import {ItemsWithSpells5e as IWS} from './defaults.js';

/**
 * The form to control Item Spell overrides (e.g. for consumption logic)
 */
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
export class ItemsWithSpells5eItemSpellOverrides extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(itemWithSpellsItem, itemSpellId) {
    const itemSpellFlagData = itemWithSpellsItem.itemSpellFlagMap.get(itemSpellId);
    const itemSpellItem = itemWithSpellsItem.itemSpellItemMap.get(itemSpellId);
    const id = `${IWS.MODULE_ID}-${itemWithSpellsItem.item.id}-${itemSpellItem.id}`

    // initialise `this` and overwrite the id
    super({
      id: id
    });

    // the parent item's flags for overrides
    this.overrides = itemSpellFlagData?.overrides ?? {};

    // the spell we are editing
    this.itemSpellId = itemSpellId;

    // the ItemsWithSpells5eItem instance to use
    this.itemWithSpellsItem = itemWithSpellsItem;

    // the parent item
    this.item = itemWithSpellsItem.item;

    // the fake or real spell item
    this.itemSpellItem = itemSpellItem;
  }

  static DEFAULT_OPTIONS = {
    id: IWS.MODULE_ID,
    tag: "form",
    form: {
      handler: ItemsWithSpells5eItemSpellOverrides._formHandler,
      closeOnSubmit: false,
      submitOnChange: true
    },
    position: {
      width: 560,
      height: "auto"
    },
    window: {
      icon: "fas fa-wand-sparkles",
      title: "Override Dialog",
      contentClasses: ['dnd5e2', 'sheet', 'item', 'iws']
    }
  }
  static PARTS = {
    form: {
      template: IWS.TEMPLATES.overrides
    },
    footer: {
      template: "templates/generic/form-footer.hbs",
    }
  }

  get title() {
    return `${this.item.name} - ${this.itemSpellItem.name}`;
  }

  _prepareContext() {
    /* NOG DOEN VOOR EMBEDDED SPELL OVERRIDES
      If this is an embedded spell, fill the override object with the values of the spell,
      instead of using the one from the flag.
      This way, the form correctly reflect the current values on an embedded spell.
      Values from activities use the first found activity (of its type).
    */
    const spell = this.itemSpellItem;
    const saveActivity = spell.system.activities.getByType("save");
    const attackActivity = spell.system.activities.getByType("attack");
    const firstActivity = attackActivity[0] ?? saveActivity[0] ?? spell.isActive ? spell.system.activities.entries().next().value[1] : {};
    const overrides = this.overrides;
    const buttonText = `${game.i18n.localize("Save")} & ${game.i18n.localize("Close")}`;
    const hasUses = this.item.hasLimitedUses && this.item.system?.uses?.max > 0;
    const abilitiesArray = Object.entries(CONFIG.DND5E.abilities).map(([value, config]) => ({
      value, label: config.label, group: game.i18n.localize("DND5E.Abilities")
    }));
    const ret = {
      spell,
      overrides,
      spellStats: {
        activity: firstActivity,
        saveActivity: saveActivity[0] ?? {},
        attackActivity: attackActivity[0] ?? {},
        spentUses: spell.isEmbedded ? spell.system.uses.spent : "",
        hasNoFlatDC: overrides.activities?.Saves?.save?.dc?.calculation ?? '',
        saveAbility: saveActivity[0]?.save?.ability
      },
      options: {
        // Based on dnd5e/module/applications/activity/activity-sheet.mjs:265
        recoveryPeriods: [
          {value: "", label: "DND5E.UsesPeriods.Never"},
          ...Object.entries(CONFIG.DND5E.limitedUsePeriods)
          .filter(([, config]) => !config.deprecated)
          .map(([value, config]) => ({
            value, label: config.label, group: game.i18n.localize("DND5E.DurationTime")
          }))
        ],
        // Based on dnd5e/module/applications/activity/attack-sheet.mjs:47
        abilityOptions: [
          { value: "noOverride", label: game.i18n.localize("IWS.FORM.NoOverride") },
          { rule: true },
          { value: "", label: game.i18n.format("DND5E.DefaultSpecific", {
            default: game.i18n.localize("DND5E.Spellcasting").toLowerCase() }) },
          { value: "none", label: game.i18n.localize("DND5E.None") },
          { value: "spellcasting", label: game.i18n.localize("DND5E.SpellAbility") },
          ...abilitiesArray
        ],
        // Based on dnd5e/module/applications/activity/save-sheet.mjs:50
        calculationOptions: [
          { value: "noOverride", label: game.i18n.localize("IWS.FORM.NoOverride") },
          { rule: true },
          { value: "", label: `${game.i18n.localize("DND5E.Flat")} (${game.i18n.localize("DND5E.SAVE.FIELDS.save.dc.CustomFormula")})` },
          { value: "spellcasting", label: game.i18n.localize("DND5E.SpellAbility") },
          ...abilitiesArray
        ],
        itemUses: [{value: "itemUses", label: "DND5E.CONSUMPTION.Type.ItemUses.Label" }],
        parentItem: [{value: this.item.id, label: this.item.name }]
      },
      parentItem: {
        id: this.item.id,
        name: this.item.name,
        isEmbedded: this.item.isEmbedded,
        hasNoUses: !hasUses,
        hasNoUsesHint: hasUses ? false : 'IWS.FORM.NoUsesHint'
      },
      buttons: [
        { type: "submit", icon: "fa-solid fa-save", label: buttonText }
      ],
      fieldDefault: new foundry.data.fields.StringField(),
      inputs: {
        createCheckboxInput: dnd5e.applications.fields.createCheckboxInput
      }
    };
    return ret;
  }

  static async _formHandler(event, form, formData) {
    const formDataExpanded = foundry.utils.expandObject(formData.object);
    this.overrides = formDataExpanded.overrides;
    if (event instanceof SubmitEvent) {
      // Button pressed to save and close the form
      await this.itemWithSpellsItem.updateItemSpellOverrides(this.itemSpellId, this.overrides);
      this.close();
    } else {
      // Save which element has focus
      const focus = this.element.querySelector(":focus");
      const focusSelector = focus ? `${focus.tagName}[name="${focus.name}"]` : null;
      // Update the form to reflect the change
      this.render(null, {focusSelector});
    }
  }

   // Copied from dnd5e/module/applications/api/application.mjs:86
  _onRender(context, options) {
    super._onRender(context, options);

    // Add special styling for label-top hints.
    this.element.querySelectorAll(".label-top > p.hint").forEach(hint => {
      const label = hint.parentElement.querySelector(":scope > label");
      if ( !label ) return;
      hint.ariaLabel = hint.innerText;
      hint.dataset.tooltip = hint.innerHTML;
      hint.innerHTML = "";
      label.insertAdjacentElement("beforeend", hint);
    });

    if (options.focusSelector) {
      this.element.querySelector(options.focusSelector)?.focus();
    }
  }
}
