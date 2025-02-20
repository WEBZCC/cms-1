/** global: Craft */
/** global: Garnish */
import Garnish from '../../../garnish/src';

/**
 * Element index class
 */
Craft.BaseElementIndex = Garnish.Base.extend(
  {
    initialized: false,
    elementType: null,
    idPrefix: null,

    instanceState: null,
    sourceStates: null,
    sourceStatesStorageKey: null,

    searchTimeout: null,
    sourceSelect: null,

    $container: null,
    $main: null,
    isIndexBusy: false,

    $sidebar: null,
    showingSidebar: null,
    sourceKey: null,
    sourceViewModes: null,
    $source: null,
    sourcesByKey: null,
    $visibleSources: null,

    $customizeSourcesBtn: null,
    customizeSourcesModal: null,

    $toolbar: null,
    toolbarOffset: null,

    $searchContainer: null,
    $search: null,
    $filterBtn: null,
    searching: false,
    searchText: null,
    trashed: false,
    drafts: false,
    $clearSearchBtn: null,

    $statusMenuBtn: null,
    $statusMenuContainer: null,
    statusMenu: null,
    status: null,

    $siteMenuBtn: null,
    siteMenu: null,
    siteId: null,

    $sortMenuBtn: null,
    sortMenu: null,
    $sortAttributesList: null,
    $sortDirectionsList: null,
    $scoreSortAttribute: null,
    $structureSortAttribute: null,

    $elements: null,
    $updateSpinner: null,
    $viewModeBtnContainer: null,
    viewModeBtns: null,
    viewMode: null,
    view: null,
    _autoSelectElements: null,
    $countSpinner: null,
    $countContainer: null,
    page: 1,
    resultSet: null,
    totalResults: null,
    $exportBtn: null,

    actions: null,
    actionsHeadHtml: null,
    actionsBodyHtml: null,
    $selectAllContainer: null,
    $selectAllCheckbox: null,
    showingActionTriggers: false,
    exporters: null,
    exportersByType: null,
    _$detachedToolbarItems: null,
    _$triggers: null,

    _ignoreFailedRequest: false,
    _cancelToken: null,

    filterHuds: null,

    /**
     * Constructor
     */
    init: function (elementType, $container, settings) {
      this.elementType = elementType;
      this.$container = $container;
      this.setSettings(settings, Craft.BaseElementIndex.defaults);

      // Define an ID prefix that can be used for dynamically created elements
      // ---------------------------------------------------------------------

      this.idPrefix = Craft.randomString(10);

      // Set the state objects
      // ---------------------------------------------------------------------

      this.instanceState = this.getDefaultInstanceState();

      this.sourceStates = {};

      // Instance states (selected source) are stored by a custom storage key defined in the settings
      if (this.settings.storageKey) {
        $.extend(
          this.instanceState,
          Craft.getLocalStorage(this.settings.storageKey),
          {}
        );
      }

      // Source states (view mode, etc.) are stored by the element type and context
      this.sourceStatesStorageKey =
        'BaseElementIndex.' + this.elementType + '.' + this.settings.context;
      $.extend(
        this.sourceStates,
        Craft.getLocalStorage(this.sourceStatesStorageKey, {})
      );

      // Find the DOM elements
      // ---------------------------------------------------------------------

      this.$main = this.$container.find('.main');
      this.$toolbar = this.$container.find(this.settings.toolbarSelector);
      this.$statusMenuBtn = this.$toolbar.find('.statusmenubtn:first');
      this.$statusMenuContainer = this.$statusMenuBtn.parent();
      this.$siteMenuBtn = this.$container.find('.sitemenubtn:first');
      this.$sortMenuBtn = this.$toolbar.find('.sortmenubtn:first');

      this.$searchContainer = this.$toolbar.find('.search:first');
      this.$search = this.$searchContainer.children('input:first');
      this.$filterBtn = this.$searchContainer.children('.filter-btn:first');
      this.$clearSearchBtn = this.$searchContainer.children('.clear-btn:first');

      this.$sidebar = this.$container.find('.sidebar:first');
      this.$customizeSourcesBtn = this.$sidebar.find('.customize-sources');

      this.$elements = this.$container.find('.elements:first');
      this.$updateSpinner = this.$elements.find('.spinner');

      if (!this.$updateSpinner.length) {
        this.$updateSpinner = $('<div/>', {
          class: 'update-spinner spinner spinner-absolute',
        }).appendTo(this.$elements);
      }

      this.$countSpinner = this.$container.find('#count-spinner');
      this.$countContainer = this.$container.find('#count-container');
      this.$exportBtn = this.$container.find('#export-btn');

      // Hide sidebar if needed
      if (this.settings.hideSidebar) {
        this.$sidebar.hide();
        $('.body, .content', this.$container).removeClass('has-sidebar');
      }

      // Initialize the sources
      // ---------------------------------------------------------------------

      if (!this.initSources()) {
        return;
      }

      // Customize button
      if (this.$customizeSourcesBtn.length) {
        this.addListener(
          this.$customizeSourcesBtn,
          'click',
          'createCustomizeSourcesModal'
        );
      }

      // Initialize the status menu
      // ---------------------------------------------------------------------

      if (this.$statusMenuBtn.length) {
        this.statusMenu = this.$statusMenuBtn.menubtn().data('menubtn').menu;
        this.statusMenu.on('optionselect', this._handleStatusChange.bind(this));
      }

      // Initialize the site menu
      // ---------------------------------------------------------------------

      // Is there a site menu?
      if (this.$siteMenuBtn.length) {
        this.siteMenu = this.$siteMenuBtn.menubtn().data('menubtn').menu;

        // Figure out the initial site
        var $option = this.siteMenu.$options.filter('.sel:first');

        if (!$option.length) {
          $option = this.siteMenu.$options.first();
        }

        if ($option.length) {
          this._setSite($option.data('site-id'));
        } else {
          // No site options -- they must not have any site permissions
          this.settings.criteria = {id: '0'};
        }

        this.siteMenu.on('optionselect', this._handleSiteChange.bind(this));

        if (this.siteId) {
          // Should we be using a different default site?
          var defaultSiteId =
            this.settings.defaultSiteId || Craft.cp.getSiteId();

          if (defaultSiteId && defaultSiteId != this.siteId) {
            // Is that one available here?
            var $storedSiteOption = this.siteMenu.$options.filter(
              '[data-site-id="' + defaultSiteId + '"]:first'
            );

            if ($storedSiteOption.length) {
              // Todo: switch this to siteMenu.selectOption($storedSiteOption) once Menu is updated to support that
              $storedSiteOption.trigger('click');
            }
          }
        }
      } else if (
        this.settings.criteria &&
        this.settings.criteria.siteId &&
        this.settings.criteria.siteId !== '*'
      ) {
        this._setSite(this.settings.criteria.siteId);
      } else {
        this._setSite(Craft.siteId);
      }

      // Don't let the criteria override the selected site
      if (this.settings.criteria && this.settings.criteria.siteId) {
        delete this.settings.criteria.siteId;
      }

      // Initialize the search input
      // ---------------------------------------------------------------------

      // Automatically update the elements after new search text has been sitting for a 1/2 second
      this.addListener(this.$search, 'input', () => {
        if (!this.searching && this.$search.val()) {
          this.startSearching();
        } else if (this.searching && !this.$search.val()) {
          this.stopSearching();
        }

        if (this.searchTimeout) {
          clearTimeout(this.searchTimeout);
        }

        this.searchTimeout = setTimeout(
          this.updateElementsIfSearchTextChanged.bind(this),
          500
        );
      });

      // Update the elements when the Return key is pressed
      this.addListener(this.$search, 'keypress', (ev) => {
        if (ev.keyCode === Garnish.RETURN_KEY) {
          ev.preventDefault();

          if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
          }

          this.updateElementsIfSearchTextChanged();
        }
      });

      // Clear the search when the X button is clicked
      this.addListener(this.$clearSearchBtn, 'click', () => {
        this.clearSearch(true);

        if (!Garnish.isMobileBrowser(true)) {
          this.$search.trigger('focus');
        }
      });

      // Auto-focus the Search box
      if (!Garnish.isMobileBrowser(true)) {
        this.$search.trigger('focus');
      }

      // Filter HUDs
      this.filterHuds = {};
      this.addListener(this.$filterBtn, 'click', 'showFilterHud');

      // Initialize the sort menu
      // ---------------------------------------------------------------------

      // Is there a sort menu?
      if (this.$sortMenuBtn.length) {
        this.sortMenu = this.$sortMenuBtn.menubtn().data('menubtn').menu;
        this.$sortAttributesList =
          this.sortMenu.$container.children('.sort-attributes');
        this.$sortDirectionsList =
          this.sortMenu.$container.children('.sort-directions');

        this.sortMenu.on('optionselect', this._handleSortChange.bind(this));
      }

      // Set the default status and sort options
      // ---------------------------------------------------------------------

      const queryParams = Craft.getQueryParams();

      if (queryParams.status) {
        let selector;
        switch (queryParams.status) {
          case 'trashed':
            selector = '[data-trashed]';
            break;
          case 'drafts':
            selector = '[data-drafts]';
            break;
          default:
            selector = `[data-status="${queryParams.status}"]`;
        }

        const $option = this.statusMenu.$options.filter(selector);
        if ($option.length) {
          this.statusMenu.selectOption($option[0]);
        } else {
          this.setQueryParam('status', null);
        }
      }

      // Initialize the Export button
      // ---------------------------------------------------------------------

      this.addListener(this.$exportBtn, 'click', '_showExportHud');

      // Let everyone know that the UI is initialized
      // ---------------------------------------------------------------------

      this.initialized = true;
      this.afterInit();

      // Select the initial source
      // ---------------------------------------------------------------------

      this.selectDefaultSource();

      // Select the default sort attribute/direction
      // ---------------------------------------------------------------------

      if (queryParams.sort) {
        const lastDashPos = queryParams.sort.lastIndexOf('-');
        if (lastDashPos !== -1) {
          const attr = queryParams.sort.substr(0, lastDashPos);
          const dir = queryParams.sort.substr(lastDashPos + 1);
          this.setSortAttribute(attr);
          this.setSortDirection(dir);
          this.storeSortAttributeAndDirection();
        }
      }

      // Load the first batch of elements!
      // ---------------------------------------------------------------------

      // Default to whatever page is in the URL
      this.setPage(Craft.pageNum);

      this.updateElements(true);
    },

    afterInit: function () {
      this.onAfterInit();
    },

    _createCancelToken: function () {
      this._cancelToken = axios.CancelToken.source();
      return this._cancelToken.token;
    },

    _cancelRequests: function () {
      if (this._cancelToken) {
        this._ignoreFailedRequest = true;
        this._cancelToken.cancel();
        Garnish.requestAnimationFrame(() => {
          this._ignoreFailedRequest = false;
        });
      }
    },

    getSourceContainer: function () {
      return this.$sidebar.find('nav > ul');
    },

    get $sources() {
      if (!this.sourceSelect) {
        return undefined;
      }

      return this.sourceSelect.$items;
    },

    getSite: function () {
      if (!this.siteId) {
        return undefined;
      }
      return Craft.sites.find((s) => s.id == this.siteId);
    },

    initSources: function () {
      var $sources = this._getSourcesInList(this.getSourceContainer());

      // No source, no party.
      if ($sources.length === 0) {
        return false;
      }

      // The source selector
      if (!this.sourceSelect) {
        this.sourceSelect = new Garnish.Select(this.$sidebar.find('nav'), {
          multi: false,
          allowEmpty: false,
          vertical: true,
          onSelectionChange: this._handleSourceSelectionChange.bind(this),
        });
      }

      this.sourcesByKey = {};

      for (let i = 0; i < $sources.length; i++) {
        this.initSource($($sources[i]));
      }

      return true;
    },

    selectDefaultSource: function () {
      var sourceKey = this.getDefaultSourceKey(),
        $source;

      if (sourceKey) {
        $source = this.getSourceByKey(sourceKey);

        // Make sure it's visible
        if (this.$visibleSources.index($source) === -1) {
          $source = null;
        }
      }

      if (!sourceKey || !$source) {
        // Select the first source by default
        $source = this.$visibleSources.first();
      }

      return this.selectSource($source);
    },

    refreshSources: function () {
      this.sourceSelect.removeAllItems();

      this.setIndexBusy();

      Craft.sendActionRequest('POST', this.settings.refreshSourcesAction, {
        data: {
          context: this.settings.context,
          elementType: this.elementType,
        },
      })
        .then((response) => {
          this.setIndexAvailable();
          this.getSourceContainer().replaceWith(response.data.html);
          this.initSources();
          this.selectDefaultSource();
        })
        .catch(() => {
          this.setIndexAvailable();
          if (!this._ignoreFailedRequest) {
            Craft.cp.displayError(Craft.t('app', 'A server error occurred.'));
          }
        });
    },

    initSource: function ($source) {
      this.sourceSelect.addItems($source);
      this.initSourceToggle($source);
      this.sourcesByKey[$source.data('key')] = $source;

      if (
        $source.data('hasNestedSources') &&
        this.instanceState.expandedSources.indexOf($source.data('key')) !== -1
      ) {
        this._expandSource($source);
      }
    },

    initSourceToggle: function ($source) {
      // Remove handlers for the same thing. Just in case.
      this.deinitSourceToggle($source);

      var $toggle = this._getSourceToggle($source);

      if ($toggle.length) {
        this.addListener($source, 'dblclick', '_handleSourceDblClick');
        this.addListener($toggle, 'click', '_handleSourceToggleClick');
        $source.data('hasNestedSources', true);
      } else {
        $source.data('hasNestedSources', false);
      }
    },

    deinitSource: function ($source) {
      this.sourceSelect.removeItems($source);
      this.deinitSourceToggle($source);
      delete this.sourcesByKey[$source.data('key')];
    },

    deinitSourceToggle: function ($source) {
      if ($source.data('hasNestedSources')) {
        this.removeListener($source, 'dblclick');
        this.removeListener(this._getSourceToggle($source), 'click');
      }

      $source.removeData('hasNestedSources');
    },

    getDefaultInstanceState: function () {
      return {
        selectedSource: null,
        expandedSources: [],
      };
    },

    getDefaultSourceKey: function () {
      if (this.settings.defaultSource) {
        var paths = this.settings.defaultSource.split('/'),
          path = '';

        // Expand the tree
        for (var i = 0; i < paths.length; i++) {
          path += paths[i];
          var $source = this.getSourceByKey(path);

          // If the folder can't be found, then just go to the stored instance source.
          if (!$source) {
            return this.instanceState.selectedSource;
          }

          this._expandSource($source);
          path += '/';
        }

        // Just make sure that the modal is aware of the newly expanded sources, too.
        this._setSite(this.siteId);

        return this.settings.defaultSource;
      }

      return this.instanceState.selectedSource;
    },

    getDefaultExpandedSources: function () {
      return this.instanceState.expandedSources;
    },

    startSearching: function () {
      // Show the clear button and add/select the Score sort option
      this.$clearSearchBtn.removeClass('hidden');

      if (!this.$scoreSortAttribute) {
        this.$scoreSortAttribute = $(
          '<li><a data-attr="score">' + Craft.t('app', 'Score') + '</a></li>'
        );
        this.sortMenu.addOptions(this.$scoreSortAttribute.children());
      }

      this.$scoreSortAttribute.prependTo(this.$sortAttributesList);

      this.searching = true;

      this._updateStructureSortOption();
      this.setSortAttribute('score');
    },

    clearSearch: function (updateElements) {
      if (!this.searching) {
        return;
      }

      this.$search.val('');

      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout);
      }

      this.stopSearching();

      if (updateElements) {
        this.updateElementsIfSearchTextChanged();
      } else {
        this.searchText = null;
      }
    },

    stopSearching: function () {
      // Hide the clear button and Score sort option
      this.$clearSearchBtn.addClass('hidden');

      this.$scoreSortAttribute.detach();

      this.searching = false;

      this._updateStructureSortOption();
    },

    setInstanceState: function (key, value) {
      if (typeof key === 'object') {
        $.extend(this.instanceState, key);
      } else {
        this.instanceState[key] = value;
      }

      this.storeInstanceState();
    },

    storeInstanceState: function () {
      if (this.settings.storageKey) {
        Craft.setLocalStorage(this.settings.storageKey, this.instanceState);
      }
    },

    getSourceState: function (source, key, defaultValue) {
      if (typeof this.sourceStates[source] === 'undefined') {
        // Set it now so any modifications to it by whoever's calling this will be stored.
        this.sourceStates[source] = {};
      }

      if (typeof key === 'undefined') {
        return this.sourceStates[source];
      } else if (typeof this.sourceStates[source][key] !== 'undefined') {
        return this.sourceStates[source][key];
      } else {
        return typeof defaultValue !== 'undefined' ? defaultValue : null;
      }
    },

    getSelectedSourceState: function (key, defaultValue) {
      return this.getSourceState(
        this.instanceState.selectedSource,
        key,
        defaultValue
      );
    },

    setSelecetedSourceState: function (key, value) {
      var viewState = this.getSelectedSourceState();

      if (typeof key === 'object') {
        $.extend(viewState, key);
      } else {
        viewState[key] = value;
      }

      this.sourceStates[this.instanceState.selectedSource] = viewState;

      // Store it in localStorage too
      Craft.setLocalStorage(this.sourceStatesStorageKey, this.sourceStates);
    },

    storeSortAttributeAndDirection: function () {
      const attr = this.getSelectedSortAttribute();

      if (attr !== 'score') {
        const history = [];

        if (attr) {
          // Remember the previous choices
          const attributes = [attr];

          // Only include the most last attribute if it changed
          const lastAttr = this.getSelectedSourceState('order');
          if (lastAttr && lastAttr !== attr) {
            history.push([lastAttr, this.getSelectedSourceState('sort')]);
            attributes.push(lastAttr);
          }

          const oldHistory = this.getSelectedSourceState('orderHistory', []);
          for (let i = 0; i < oldHistory.length; i++) {
            const [a] = oldHistory[i];
            if (a && !attributes.includes(a)) {
              history.push(oldHistory[i]);
              attributes.push(a);
            } else {
              break;
            }
          }
        }

        this.setSelecetedSourceState({
          order: attr,
          sort: this.getSelectedSortDirection(),
          orderHistory: history,
        });
      }
    },

    /**
     * Sets the page number.
     */
    setPage: function (page) {
      if (this.settings.context !== 'index') {
        return;
      }

      page = Math.max(page, 1);
      this.page = page;

      const url = Craft.getPageUrl(this.page);
      history.replaceState({}, '', url);
    },

    _resetCount: function () {
      this.resultSet = null;
      this.totalResults = null;
    },

    /**
     * Returns the data that should be passed to the elementIndex/getElements controller action
     * when loading elements.
     */
    getViewParams: function () {
      var criteria = {
        siteId: this.siteId,
        search: this.searchText,
        offset: this.settings.batchSize * (this.page - 1),
        limit: this.settings.batchSize,
      };

      // Only set drafts/draftOf/trashed params when needed, so we don't potentially override a source's criteria
      if (
        this.settings.canHaveDrafts &&
        (this.drafts || (this.settings.context === 'index' && !this.status))
      ) {
        criteria.drafts = this.drafts || null;
        criteria.savedDraftsOnly = true;
        if (!this.drafts) {
          criteria.draftOf = false;
        }
      }
      if (this.trashed) {
        criteria.trashed = true;
      }

      if (!Garnish.hasAttr(this.$source, 'data-override-status')) {
        criteria.status = this.status;
      }

      $.extend(criteria, this.settings.criteria);

      var params = {
        context: this.settings.context,
        elementType: this.elementType,
        source: this.instanceState.selectedSource,
        condition: this.settings.condition,
        criteria: criteria,
        disabledElementIds: this.settings.disabledElementIds,
        viewState: $.extend({}, this.getSelectedSourceState()),
        paginated: this._isViewPaginated() ? 1 : 0,
      };

      // Possible that the order/sort isn't entirely accurate if we're sorting by Score
      params.viewState.order = this.getSelectedSortAttribute();
      params.viewState.sort = this.getSelectedSortDirection();

      if (this.getSelectedSortAttribute() === 'structure') {
        if (typeof this.instanceState.collapsedElementIds === 'undefined') {
          this.instanceState.collapsedElementIds = [];
        }
        params.collapsedElementIds = this.instanceState.collapsedElementIds;
      }

      if (
        this.filterHuds[this.siteId] &&
        this.filterHuds[this.siteId][this.sourceKey] &&
        this.filterHuds[this.siteId][this.sourceKey].serialized
      ) {
        params.filters =
          this.filterHuds[this.siteId][this.sourceKey].serialized;
      }

      // Give plugins a chance to hook in here
      this.trigger('registerViewParams', {
        params: params,
      });

      return params;
    },

    updateElements: function (preservePagination) {
      // Ignore if we're not fully initialized yet
      if (!this.initialized) {
        return;
      }

      // Cancel any ongoing requests
      this._cancelRequests();

      this.setIndexBusy();

      // Kill the old view class
      if (this.view) {
        this.view.destroy();
        delete this.view;
      }

      if (preservePagination !== true) {
        this.setPage(1);
        this._resetCount();
      }

      var params = this.getViewParams();

      Craft.sendActionRequest('POST', this.settings.updateElementsAction, {
        data: params,
        cancelToken: this._createCancelToken(),
      })
        .then((response) => {
          this.setIndexAvailable();
          (this.settings.context === 'index'
            ? Garnish.$scrollContainer
            : this.$main
          ).scrollTop(0);
          this._updateView(params, response.data);
        })
        .catch((e) => {
          this.setIndexAvailable();
          if (!this._ignoreFailedRequest) {
            Craft.cp.displayError(Craft.t('app', 'A server error occurred.'));
          }
        });
    },

    updateElementsIfSearchTextChanged: function () {
      if (
        this.searchText !==
        (this.searchText = this.searching ? this.$search.val() : null)
      ) {
        this.updateElements();
      }
    },

    showActionTriggers: function () {
      // Ignore if they're already shown
      if (this.showingActionTriggers) {
        return;
      }

      // Hard-code the min toolbar height in case it was taller than the actions toolbar
      // (prevents the elements from jumping if this ends up being a double-click)
      this.$toolbar.css('min-height', this.$toolbar.height());

      // Hide any toolbar inputs
      this._$detachedToolbarItems = this.$toolbar.children();
      this._$detachedToolbarItems.detach();

      if (!this._$triggers) {
        this._createTriggers();
      } else {
        this._$triggers.appendTo(this.$toolbar);
      }

      this.showingActionTriggers = true;
    },

    submitAction: function (action, actionParams) {
      // Make sure something's selected
      var selectedElementIds = this.view.getSelectedElementIds(),
        totalSelected = selectedElementIds.length;

      if (totalSelected === 0) {
        return;
      }

      if (typeof action === 'string') {
        action = this._findAction(action);
      }

      if (action.confirm && !confirm(action.confirm)) {
        return;
      }

      // Cancel any ongoing requests
      this._cancelRequests();

      // Get ready to submit
      var viewParams = this.getViewParams();

      actionParams = actionParams ? Craft.expandPostArray(actionParams) : {};
      var params = $.extend(viewParams, action.settings || {}, actionParams, {
        elementAction: action.type,
        elementIds: selectedElementIds,
      });

      // Do it
      this.setIndexBusy();
      this._autoSelectElements = selectedElementIds;

      if (action.download) {
        if (Craft.csrfTokenName) {
          params[Craft.csrfTokenName] = Craft.csrfTokenValue;
        }
        Craft.downloadFromUrl(
          'POST',
          Craft.getActionUrl(this.settings.submitActionsAction),
          params
        )
          .then((response) => {
            this.setIndexAvailable();
          })
          .catch((e) => {
            this.setIndexAvailable();
          });
      } else {
        Craft.sendActionRequest('POST', this.settings.submitActionsAction, {
          data: params,
          cancelToken: this._createCancelToken(),
        })
          .then((response) => {
            // Update the count text too
            this._resetCount();
            this._updateView(viewParams, response.data);

            if (typeof response.data.badgeCounts !== 'undefined') {
              this._updateBadgeCounts(response.data.badgeCounts);
            }

            if (response.data.message) {
              Craft.cp.displaySuccess(response.data.message);
            }

            this.afterAction(action, params);
          })
          .catch(({response}) => {
            Craft.cp.displayError(response.data.message);
          })
          .finally(() => {
            this.setIndexAvailable();
          });
      }
    },

    _findAction: function (actionClass) {
      for (var i = 0; i < this.actions.length; i++) {
        if (this.actions[i].type === actionClass) {
          return this.actions[i];
        }
      }
      throw `Invalid element action: ${actionClass}`;
    },

    afterAction: function (action, params) {
      // There may be a new background job that needs to be run
      Craft.cp.runQueue();

      this.onAfterAction(action, params);
    },

    hideActionTriggers: function () {
      // Ignore if there aren't any
      if (!this.showingActionTriggers) {
        return;
      }

      this._$detachedToolbarItems.appendTo(this.$toolbar);
      this._$triggers.detach();
      // this._$detachedToolbarItems.removeClass('hidden');

      // Unset the min toolbar height
      this.$toolbar.css('min-height', '');

      this.showingActionTriggers = false;
    },

    updateActionTriggers: function () {
      // Do we have an action UI to update?
      if (this.actions) {
        var totalSelected = this.view.getSelectedElements().length;

        if (totalSelected !== 0) {
          if (totalSelected === this.view.getEnabledElements().length) {
            this.$selectAllCheckbox.removeClass('indeterminate');
            this.$selectAllCheckbox.addClass('checked');
            this.$selectAllContainer.attr('aria-checked', 'true');
          } else {
            this.$selectAllCheckbox.addClass('indeterminate');
            this.$selectAllCheckbox.removeClass('checked');
            this.$selectAllContainer.attr('aria-checked', 'mixed');
          }

          this.showActionTriggers();
        } else {
          this.$selectAllCheckbox.removeClass('indeterminate checked');
          this.$selectAllContainer.attr('aria-checked', 'false');
          this.hideActionTriggers();
        }
      }
    },

    getSelectedElements: function () {
      return this.view ? this.view.getSelectedElements() : $();
    },

    getSelectedElementIds: function () {
      return this.view ? this.view.getSelectedElementIds() : [];
    },

    setStatus: function (status) {
      // Find the option (and make sure it actually exists)
      var $option = this.statusMenu.$options.filter(
        'a[data-status="' + status + '"]:first'
      );

      if ($option.length) {
        this.statusMenu.selectOption($option[0]);
      }
    },

    getSortAttributeOption: function (attr) {
      return this.$sortAttributesList.find('a[data-attr="' + attr + '"]:first');
    },

    getSelectedSortAttribute: function () {
      return this.$sortAttributesList.find('a.sel:first').data('attr');
    },

    setSortAttribute: function (attr) {
      // Find the option (and make sure it actually exists)
      var $option = this.getSortAttributeOption(attr);

      if ($option.length) {
        this.$sortAttributesList.find('a.sel').removeClass('sel');
        $option.addClass('sel');

        const label = this.getSortLabel(attr);
        this.$sortMenuBtn.attr(
          'title',
          Craft.t('app', 'Sort by {attribute}', {attribute: label})
        );
        this.$sortMenuBtn.text(label);

        if (attr === 'score') {
          this.setSortDirection('desc');
        } else {
          this.setSortDirection($option.data('default-dir') || 'asc');
        }

        if (attr === 'structure') {
          this.$sortDirectionsList.find('a').addClass('disabled');
        } else {
          this.$sortDirectionsList.find('a').removeClass('disabled');
        }
      }
    },

    getSortLabel: function (attr) {
      const $option = this.getSortAttributeOption(attr);

      if (!$option.length) return;

      return $option.text();
    },

    getSortDirectionOption: function (dir) {
      return this.$sortDirectionsList.find('a[data-dir=' + dir + ']:first');
    },

    getSelectedSortDirection: function () {
      return this.$sortDirectionsList.find('a.sel:first').data('dir') || 'asc';
    },

    getSelectedViewMode: function () {
      return this.getSelectedSourceState('mode') || 'table';
    },

    setSortDirection: function (dir) {
      if (dir !== 'desc') {
        dir = 'asc';
      }

      this.$sortMenuBtn.attr('data-icon', dir);
      this.$sortDirectionsList.find('a.sel').removeClass('sel');
      this.getSortDirectionOption(dir).addClass('sel');

      this._setSortQueryParam();
    },

    _setSortQueryParam: function () {
      const attr = this.getSelectedSortAttribute();

      if (attr && attr !== 'score') {
        const dir = this.getSelectedSortDirection();
        Craft.setQueryParam('sort', `${attr}-${dir}`);
      } else {
        Craft.setQueryParam('sort', null);
      }
    },

    getSourceByKey: function (key) {
      if (typeof this.sourcesByKey[key] === 'undefined') {
        return null;
      }

      return this.sourcesByKey[key];
    },

    selectSource: function (source) {
      const $source = $(source);

      if (!$source || !$source.length) {
        return false;
      }

      if (
        this.$source &&
        this.$source[0] &&
        this.$source[0] === $source[0] &&
        $source.data('key') === this.sourceKey
      ) {
        return false;
      }

      // Hide action triggers if they're currently being shown
      this.hideActionTriggers();

      this.$source = $source;
      this.sourceKey = $source.data('key');
      this.setInstanceState('selectedSource', this.sourceKey);
      this.sourceSelect.selectItem($source);

      Craft.cp.updateContentHeading();

      if (this.searching) {
        // Clear the search value without causing it to update elements
        this.searchText = null;
        this.$search.val('');
        this.stopSearching();
      }

      // Sort menu
      // ----------------------------------------------------------------------

      // Remove any existing custom sort options from the menu
      this.$sortAttributesList.children('li[data-extra]').remove();

      // Does this source have any custom sort options?
      let $topSource = this.$source.closest('nav > ul > li').children('a');
      let sortOptions = $topSource.data('sort-options');
      if (sortOptions) {
        for (let i = 0; i < sortOptions.length; i++) {
          let $option = $('<li/>', {
            'data-extra': true,
          })
            .append(
              $('<a/>', {
                text: sortOptions[i][0],
                'data-attr': sortOptions[i][1],
              })
            )
            .appendTo(this.$sortAttributesList);
          this.sortMenu.addOptions($option.children());
        }
      }

      // Does this source have a structure?
      if (Garnish.hasAttr(this.$source, 'data-has-structure')) {
        if (!this.$structureSortAttribute) {
          this.$structureSortAttribute = $(
            '<li><a data-attr="structure">' +
              Craft.t('app', 'Structure') +
              '</a></li>'
          );
          this.sortMenu.addOptions(this.$structureSortAttribute.children());
        }

        this.$structureSortAttribute.prependTo(this.$sortAttributesList);
      } else if (this.$structureSortAttribute) {
        this.$structureSortAttribute.removeClass('sel').detach();
      }

      this.setStoredSortOptionsForSource();

      // Status menu
      // ----------------------------------------------------------------------

      if (this.$statusMenuBtn.length) {
        if (Garnish.hasAttr(this.$source, 'data-override-status')) {
          this.$statusMenuContainer.addClass('hidden');
        } else {
          this.$statusMenuContainer.removeClass('hidden');
        }

        if (this.trashed) {
          // Swap to the initial status
          var $firstOption = this.statusMenu.$options.first();
          this.setStatus($firstOption.data('status'));
        }
      }

      // View mode buttons
      // ----------------------------------------------------------------------

      // Clear out any previous view mode data
      if (this.$viewModeBtnContainer) {
        this.$viewModeBtnContainer.remove();
      }

      this.viewModeBtns = {};
      this.viewMode = null;

      // Get the new list of view modes
      this.sourceViewModes = this.getViewModesForSource();

      // Create the buttons if there's more than one mode available to this source
      if (this.sourceViewModes.length > 1) {
        this.$viewModeBtnContainer = $('<div class="btngroup"/>').appendTo(
          this.$toolbar
        );

        for (var i = 0; i < this.sourceViewModes.length; i++) {
          let sourceViewMode = this.sourceViewModes[i];

          let $viewModeBtn = $('<button/>', {
            type: 'button',
            class:
              'btn' +
              (typeof sourceViewMode.className !== 'undefined'
                ? ` ${sourceViewMode.className}`
                : ''),
            'data-view': sourceViewMode.mode,
            'data-icon': sourceViewMode.icon,
            'aria-label': sourceViewMode.title,
            title: sourceViewMode.title,
          }).appendTo(this.$viewModeBtnContainer);

          this.viewModeBtns[sourceViewMode.mode] = $viewModeBtn;

          this.addListener(
            $viewModeBtn,
            'click',
            {mode: sourceViewMode.mode},
            function (ev) {
              this.selectViewMode(ev.data.mode);
              this.updateElements();
            }
          );
        }
      }

      // Figure out which mode we should start with
      var viewMode = this.getSelectedViewMode();

      if (!viewMode || !this.doesSourceHaveViewMode(viewMode)) {
        // Try to keep using the current view mode
        if (this.viewMode && this.doesSourceHaveViewMode(this.viewMode)) {
          viewMode = this.viewMode;
        }
        // Just use the first one
        else {
          viewMode = this.sourceViewModes[0].mode;
        }
      }

      this.selectViewMode(viewMode);

      // Filter HUD
      // ----------------------------------------------------------------------

      this.updateFilterBtn();

      this.onSelectSource();

      return true;
    },

    selectSourceByKey: function (key) {
      var $source = this.getSourceByKey(key);

      if ($source) {
        return this.selectSource($source);
      } else {
        return false;
      }
    },

    setStoredSortOptionsForSource: function () {
      var sortAttr = this.getSelectedSourceState('order'),
        sortDir = this.getSelectedSourceState('sort');

      if (!sortAttr || !sortDir) {
        // Get the default
        sortAttr = this.getDefaultSort();

        if (Garnish.isArray(sortAttr)) {
          sortDir = sortAttr[1];
          sortAttr = sortAttr[0];
        }
      }

      if (sortDir !== 'asc' && sortDir !== 'desc') {
        sortDir = 'asc';
      }

      this.setSortAttribute(sortAttr);
      this.setSortDirection(sortDir);
    },

    getDefaultSort: function () {
      // Does the source specify what to do?
      if (this.$source && Garnish.hasAttr(this.$source, 'data-default-sort')) {
        return this.$source.attr('data-default-sort').split(':');
      } else {
        // Default to whatever's first
        return [this.$sortAttributesList.find('a:first').data('attr'), 'asc'];
      }
    },

    getViewModesForSource: function () {
      var viewModes = [
        {
          mode: 'table',
          title: Craft.t('app', 'Display in a table'),
          icon: 'list',
        },
      ];

      if (this.$source && Garnish.hasAttr(this.$source, 'data-has-thumbs')) {
        viewModes.push({
          mode: 'thumbs',
          title: Craft.t('app', 'Display as thumbnails'),
          icon: 'grid',
        });
      }

      return viewModes;
    },

    doesSourceHaveViewMode: function (viewMode) {
      for (var i = 0; i < this.sourceViewModes.length; i++) {
        if (this.sourceViewModes[i].mode === viewMode) {
          return true;
        }
      }

      return false;
    },

    selectViewMode: function (viewMode, force) {
      // Make sure that the current source supports it
      if (!force && !this.doesSourceHaveViewMode(viewMode)) {
        viewMode = this.sourceViewModes[0].mode;
      }

      // Has anything changed?
      if (viewMode === this.viewMode) {
        return;
      }

      // Deselect the previous view mode
      if (
        this.viewMode &&
        typeof this.viewModeBtns[this.viewMode] !== 'undefined'
      ) {
        this.viewModeBtns[this.viewMode].removeClass('active');
      }

      this.viewMode = viewMode;
      this.setSelecetedSourceState('mode', this.viewMode);

      if (typeof this.viewModeBtns[this.viewMode] !== 'undefined') {
        this.viewModeBtns[this.viewMode].addClass('active');
      }
    },

    createView: function (mode, settings) {
      var viewClass = this.getViewClass(mode);
      return new viewClass(this, this.$elements, settings);
    },

    getViewClass: function (mode) {
      switch (mode) {
        case 'table':
          return Craft.TableElementIndexView;
        case 'thumbs':
          return Craft.ThumbsElementIndexView;
        default:
          throw `View mode "${mode}" not supported.`;
      }
    },

    rememberDisabledElementId: function (id) {
      var index = $.inArray(id, this.settings.disabledElementIds);

      if (index === -1) {
        this.settings.disabledElementIds.push(id);
      }
    },

    forgetDisabledElementId: function (id) {
      var index = $.inArray(id, this.settings.disabledElementIds);

      if (index !== -1) {
        this.settings.disabledElementIds.splice(index, 1);
      }
    },

    enableElements: function ($elements) {
      $elements
        .removeClass('disabled')
        .parents('.disabled')
        .removeClass('disabled');

      for (var i = 0; i < $elements.length; i++) {
        var id = $($elements[i]).data('id');
        this.forgetDisabledElementId(id);
      }

      this.onEnableElements($elements);
    },

    disableElements: function ($elements) {
      $elements.removeClass('sel').addClass('disabled');

      for (var i = 0; i < $elements.length; i++) {
        var id = $($elements[i]).data('id');
        this.rememberDisabledElementId(id);
      }

      this.onDisableElements($elements);
    },

    getElementById: function (id) {
      return this.view.getElementById(id);
    },

    enableElementsById: function (ids) {
      ids = $.makeArray(ids);

      for (var i = 0; i < ids.length; i++) {
        var id = ids[i],
          $element = this.getElementById(id);

        if ($element && $element.length) {
          this.enableElements($element);
        } else {
          this.forgetDisabledElementId(id);
        }
      }
    },

    disableElementsById: function (ids) {
      ids = $.makeArray(ids);

      for (var i = 0; i < ids.length; i++) {
        var id = ids[i],
          $element = this.getElementById(id);

        if ($element && $element.length) {
          this.disableElements($element);
        } else {
          this.rememberDisabledElementId(id);
        }
      }
    },

    selectElementAfterUpdate: function (id) {
      if (this._autoSelectElements === null) {
        this._autoSelectElements = [];
      }

      this._autoSelectElements.push(id);
    },

    addButton: function ($button) {
      this.getButtonContainer().append($button);
    },

    isShowingSidebar: function () {
      if (this.showingSidebar === null) {
        this.showingSidebar =
          this.$sidebar.length && !this.$sidebar.hasClass('hidden');
      }

      return this.showingSidebar;
    },

    getButtonContainer: function () {
      // Is there a predesignated place where buttons should go?
      if (this.settings.buttonContainer) {
        return $(this.settings.buttonContainer);
      } else {
        var $container = $('#action-buttons');

        if (!$container.length) {
          $container = $('<div id="action-buttons"/>').appendTo($('#header'));
        }

        return $container;
      }
    },

    setIndexBusy: function () {
      this.$elements.addClass('busy');
      this.$updateSpinner.appendTo(this.$elements);
      this.isIndexBusy = true;
    },

    setIndexAvailable: function () {
      this.$elements.removeClass('busy');
      this.$updateSpinner.remove();
      this.isIndexBusy = false;
    },

    createCustomizeSourcesModal: function () {
      // Recreate it each time
      var modal = new Craft.CustomizeSourcesModal(this, {
        onHide: function () {
          modal.destroy();
        },
      });

      return modal;
    },

    disable: function () {
      if (this.sourceSelect) {
        this.sourceSelect.disable();
      }

      if (this.view) {
        this.view.disable();
      }

      this.base();
    },

    enable: function () {
      if (this.sourceSelect) {
        this.sourceSelect.enable();
      }

      if (this.view) {
        this.view.enable();
      }

      this.base();
    },

    onAfterInit: function () {
      this.settings.onAfterInit();
      this.trigger('afterInit');
    },

    onSelectSource: function () {
      this.settings.onSelectSource(this.sourceKey);
      this.trigger('selectSource', {sourceKey: this.sourceKey});
    },

    onSelectSite: function () {
      this.settings.onSelectSite(this.siteId);
      this.trigger('selectSite', {siteId: this.siteId});
    },

    onUpdateElements: function () {
      this.settings.onUpdateElements();
      this.trigger('updateElements');
    },

    onSelectionChange: function () {
      this.settings.onSelectionChange();
      this.trigger('selectionChange');
    },

    onEnableElements: function ($elements) {
      this.settings.onEnableElements($elements);
      this.trigger('enableElements', {elements: $elements});
    },

    onDisableElements: function ($elements) {
      this.settings.onDisableElements($elements);
      this.trigger('disableElements', {elements: $elements});
    },

    onAfterAction: function (action, params) {
      this.settings.onAfterAction(action, params);
      this.trigger('afterAction', {action: action, params: params});
    },

    // UI state handlers
    // -------------------------------------------------------------------------

    _handleSourceSelectionChange: function () {
      // If the selected source was just removed (maybe because its parent was collapsed),
      // there won't be a selected source
      if (!this.sourceSelect.totalSelected) {
        this.sourceSelect.selectItem(this.$visibleSources.first());
        return;
      }

      if (this.selectSource(this.sourceSelect.$selectedItems)) {
        this.updateElements();
      }
    },

    _handleActionTriggerSubmit: function (ev) {
      ev.preventDefault();

      var $form = $(ev.currentTarget);

      // Make sure Craft.ElementActionTrigger isn't overriding this
      if ($form.hasClass('disabled') || $form.data('custom-handler')) {
        return;
      }

      this.submitAction($form.data('action'), Garnish.getPostData($form));
    },

    _handleMenuActionTriggerSubmit: function (ev) {
      var $option = $(ev.option);

      // Make sure Craft.ElementActionTrigger isn't overriding this
      if ($option.hasClass('disabled') || $option.data('custom-handler')) {
        return;
      }

      this.submitAction($option.data('action'));
    },

    _handleStatusChange: function (ev) {
      this.statusMenu.$options.removeClass('sel');
      var $option = $(ev.selectedOption).addClass('sel');
      this.$statusMenuBtn.html($option.html());

      this.trashed = false;
      this.drafts = false;
      this.status = null;
      let queryParam = null;

      if (Garnish.hasAttr($option, 'data-trashed')) {
        this.trashed = true;
        queryParam = 'trashed';
      } else if (Garnish.hasAttr($option, 'data-drafts')) {
        this.drafts = true;
        queryParam = 'drafts';
      } else {
        this.status = queryParam = $option.data('status') || null;
      }

      Craft.setQueryParam('status', queryParam);
      this._updateStructureSortOption();
      this.updateElements();
    },

    _handleSiteChange: function (ev) {
      this.siteMenu.$options.removeClass('sel');
      var $option = $(ev.selectedOption).addClass('sel');
      this.$siteMenuBtn.html($option.html());
      this._setSite($option.data('site-id'));
      this.onSelectSite();
    },

    _setSite: function (siteId) {
      let firstSite = this.siteId === null;
      this.siteId = siteId;

      this.updateSourceVisibility();

      if (
        this.initialized &&
        !firstSite &&
        (!this.$source || !this.$source.length) &&
        this.$visibleSources.length
      ) {
        this.selectSource(this.$visibleSources[0]);
      }

      // Hide any empty-nester headings
      var $headings = this.getSourceContainer().children('.heading');
      var $heading;

      for (let i = 0; i < $headings.length; i++) {
        $heading = $headings.eq(i);
        if ($heading.nextUntil('.heading', ':not(.hidden)').length !== 0) {
          $heading.removeClass('hidden');
        } else {
          $heading.addClass('hidden');
        }
      }

      if (this.initialized) {
        if (this.settings.context === 'index') {
          // Remember this site for later
          Craft.cp.setSiteId(siteId);
        }

        // Update the elements
        this.updateElements();
        this.updateFilterBtn();
      }
    },

    updateSourceVisibility: function () {
      this.$visibleSources = $();

      for (let i = 0; i < this.$sources.length; i++) {
        const $source = this.$sources.eq(i);

        if (
          !Garnish.hasAttr($source, 'data-disabled') &&
          (typeof $source.data('sites') === 'undefined' ||
            $source
              .data('sites')
              .toString()
              .split(',')
              .indexOf(this.siteId.toString()) !== -1)
        ) {
          $source.parent().removeClass('hidden');
          this.$visibleSources = this.$visibleSources.add($source);
        } else {
          $source.parent().addClass('hidden');

          // Is this the currently selected source?
          if (this.$source && this.$source.get(0) === $source.get(0)) {
            this.$source = null;
            this.sourceKey = null;
          }
        }
      }
    },

    _handleSortChange: function (ev) {
      var $option = $(ev.selectedOption);

      if ($option.hasClass('disabled') || $option.hasClass('sel')) {
        return;
      }

      // Is this an attribute or a direction?
      if ($option.parent().parent().is(this.$sortAttributesList)) {
        this.setSortAttribute($option.data('attr'));
      } else {
        this.setSortDirection($option.data('dir'));
      }

      this.storeSortAttributeAndDirection();
      this.updateElements();
    },

    _handleSelectionChange: function () {
      this.updateActionTriggers();
      this.onSelectionChange();
    },

    _handleSourceDblClick: function (ev) {
      this._toggleSource($(ev.currentTarget));
      ev.stopPropagation();
    },

    _handleSourceToggleClick: function (ev) {
      this._toggleSource($(ev.currentTarget).prev('a'));
      ev.stopPropagation();
    },

    _updateStructureSortOption: function () {
      var $option = this.getSortAttributeOption('structure');

      if (!$option.length) {
        return;
      }

      if (this.trashed || this.drafts || this.searching) {
        $option.addClass('disabled');
        if (this.getSelectedSortAttribute() === 'structure') {
          // Temporarily set the sort to the first option
          var $firstOption = this.$sortAttributesList.find(
            'a:not(.disabled):first'
          );
          this.setSortAttribute($firstOption.data('attr'));
          this.setSortDirection('asc');
        }
      } else {
        $option.removeClass('disabled');
        this.setStoredSortOptionsForSource();
      }
    },

    // Source managemnet
    // -------------------------------------------------------------------------

    _getSourcesInList: function ($list) {
      return $list.children('li').children('a');
    },

    _getChildSources: function ($source) {
      var $list = $source.siblings('ul');
      return this._getSourcesInList($list);
    },

    _getSourceToggle: function ($source) {
      return $source.siblings('.toggle');
    },

    _toggleSource: function ($source) {
      if ($source.parent('li').hasClass('expanded')) {
        this._collapseSource($source);
      } else {
        this._expandSource($source);
      }
    },

    _expandSource: function ($source) {
      $source.next('.toggle').attr({
        'aria-expanded': 'true',
        'aria-label': Craft.t('app', 'Hide nested sources'),
      });
      $source.parent('li').addClass('expanded');

      var $childSources = this._getChildSources($source);
      for (let i = 0; i < $childSources.length; i++) {
        this.initSource($($childSources[i]));
        if (this.$visibleSources) {
          this.$visibleSources = this.$visibleSources.add($childSources[i]);
        }
      }

      var key = $source.data('key');
      if (this.instanceState.expandedSources.indexOf(key) === -1) {
        this.instanceState.expandedSources.push(key);
        this.storeInstanceState();
      }
    },

    _collapseSource: function ($source) {
      $source.next('.toggle').attr({
        'aria-expanded': 'false',
        'aria-label': Craft.t('app', 'Show nested sources'),
      });
      $source.parent('li').removeClass('expanded');

      var $childSources = this._getChildSources($source);
      for (let i = 0; i < $childSources.length; i++) {
        this.deinitSource($($childSources[i]));
        this.$visibleSources = this.$visibleSources.not($childSources[i]);
      }

      var i = this.instanceState.expandedSources.indexOf($source.data('key'));
      if (i !== -1) {
        this.instanceState.expandedSources.splice(i, 1);
        this.storeInstanceState();
      }
    },

    // View
    // -------------------------------------------------------------------------

    _isViewPaginated: function () {
      return (
        this.settings.context === 'index' &&
        this.getSelectedSortAttribute() !== 'structure'
      );
    },

    _updateView: function (params, response) {
      // Cleanup
      // -------------------------------------------------------------

      // Get rid of the old action triggers regardless of whether the new batch has actions or not
      if (this.actions) {
        this.hideActionTriggers();
        this.actions =
          this.actionsHeadHtml =
          this.actionsBodyHtml =
          this._$triggers =
            null;
      }

      // Capture the focused element, in case it's about to get removed from the DOM
      const activeElement = document.activeElement;

      // Update the count text
      // -------------------------------------------------------------

      if (this.$countContainer.length) {
        this.$countSpinner.removeClass('hidden');
        this.$countContainer.html('');

        this._countResults()
          .then((total) => {
            this.$countSpinner.addClass('hidden');

            let itemLabel = Craft.elementTypeNames[this.elementType]
              ? Craft.elementTypeNames[this.elementType][2]
              : this.settings.elementTypeName.toLowerCase();
            let itemsLabel = Craft.elementTypeNames[this.elementType]
              ? Craft.elementTypeNames[this.elementType][3]
              : this.settings.elementTypePluralName.toLowerCase();

            if (!this._isViewPaginated()) {
              let countLabel = Craft.t(
                'app',
                '{total, number} {total, plural, =1{{item}} other{{items}}}',
                {
                  total: total,
                  item: itemLabel,
                  items: itemsLabel,
                }
              );
              this.$countContainer.text(countLabel);
            } else {
              let first = Math.min(
                this.settings.batchSize * (this.page - 1) + 1,
                total
              );
              let last = Math.min(first + (this.settings.batchSize - 1), total);
              let countLabel = Craft.t(
                'app',
                '{first, number}-{last, number} of {total, number} {total, plural, =1{{item}} other{{items}}}',
                {
                  first: first,
                  last: last,
                  total: total,
                  item: itemLabel,
                  items: itemsLabel,
                }
              );

              let $paginationContainer = $(
                '<div class="flex pagination"/>'
              ).appendTo(this.$countContainer);
              let totalPages = Math.max(
                Math.ceil(total / this.settings.batchSize),
                1
              );

              const $paginationNav = $('<nav/>', {
                class: 'flex',
                'aria-label': Craft.t('app', '{element} pagination', {
                  element: itemLabel,
                }),
              }).appendTo($paginationContainer);

              let $prevBtn = $('<button/>', {
                role: 'button',
                class:
                  'page-link prev-page' + (this.page > 1 ? '' : ' disabled'),
                disabled: this.page === 1,
                title: Craft.t('app', 'Previous Page'),
              }).appendTo($paginationNav);
              let $nextBtn = $('<button/>', {
                role: 'button',
                class:
                  'page-link next-page' +
                  (this.page < totalPages ? '' : ' disabled'),
                disabled: this.page === totalPages,
                title: Craft.t('app', 'Next Page'),
              }).appendTo($paginationNav);

              $('<div/>', {
                class: 'page-info',
                text: countLabel,
              }).appendTo($paginationContainer);

              if (this.page > 1) {
                this.addListener($prevBtn, 'click', function () {
                  this.removeListener($prevBtn, 'click');
                  this.removeListener($nextBtn, 'click');
                  this.setPage(this.page - 1);
                  this.updateElements(true);
                });
              }

              if (this.page < totalPages) {
                this.addListener($nextBtn, 'click', function () {
                  this.removeListener($prevBtn, 'click');
                  this.removeListener($nextBtn, 'click');
                  this.setPage(this.page + 1);
                  this.updateElements(true);
                });
              }
            }
          })
          .catch(() => {
            this.$countSpinner.addClass('hidden');
          });
      }

      // Update the view with the new container + elements HTML
      // -------------------------------------------------------------

      this.$elements.html(response.html);
      Craft.appendHeadHtml(response.headHtml);
      Craft.appendBodyHtml(response.bodyHtml);

      // Batch actions setup
      // -------------------------------------------------------------

      this.$selectAllContainer = this.$elements.find(
        '.selectallcontainer:first'
      );

      if (response.actions && response.actions.length) {
        if (this.$selectAllContainer.length) {
          this.actions = response.actions;
          this.actionsHeadHtml = response.actionsHeadHtml;
          this.actionsBodyHtml = response.actionsBodyHtml;

          // Create the select all checkbox
          this.$selectAllCheckbox = $('<div class="checkbox"/>').prependTo(
            this.$selectAllContainer
          );

          this.$selectAllContainer.attr({
            role: 'checkbox',
            tabindex: '0',
            'aria-checked': 'false',
            'aria-label': Craft.t('app', 'Select all'),
          });

          this.addListener(this.$selectAllContainer, 'click', function () {
            if (this.view.getSelectedElements().length === 0) {
              this.view.selectAllElements();
            } else {
              this.view.deselectAllElements();
            }
          });

          this.addListener(this.$selectAllContainer, 'keydown', function (ev) {
            if (ev.keyCode === Garnish.SPACE_KEY) {
              ev.preventDefault();

              $(ev.currentTarget).trigger('click');
            }
          });
        }
      } else {
        if (!this.$selectAllContainer.siblings().length) {
          this.$selectAllContainer.parent('.header').remove();
        }
        this.$selectAllContainer.remove();
      }

      // Exporters setup
      // -------------------------------------------------------------

      this.exporters = response.exporters;
      this.exportersByType = Craft.index(this.exporters || [], (e) => e.type);

      if (this.exporters && this.exporters.length) {
        this.$exportBtn.removeClass('hidden');
      } else {
        this.$exportBtn.addClass('hidden');
      }

      // Create the view
      // -------------------------------------------------------------

      // Should we make the view selectable?
      var selectable = this.actions || this.settings.selectable;

      this.view = this.createView(this.getSelectedViewMode(), {
        context: this.settings.context,
        batchSize:
          this.settings.context !== 'index' ||
          this.getSelectedSortAttribute() === 'structure'
            ? this.settings.batchSize
            : null,
        params: params,
        selectable: selectable,
        multiSelect: this.actions || this.settings.multiSelect,
        checkboxMode: !!this.actions,
        onSelectionChange: this._handleSelectionChange.bind(this),
      });

      // Refocus the previously-focused element
      // -------------------------------------------------------------

      if (
        activeElement &&
        activeElement.id &&
        !document.body.contains(activeElement)
      ) {
        $(`#${activeElement.id}`).focus();
      }

      // Auto-select elements
      // -------------------------------------------------------------

      if (this._autoSelectElements) {
        if (selectable) {
          for (var i = 0; i < this._autoSelectElements.length; i++) {
            this.view.selectElementById(this._autoSelectElements[i]);
          }
        }

        this._autoSelectElements = null;
      }

      // Trigger the event
      // -------------------------------------------------------------

      this.onUpdateElements();
    },

    _updateBadgeCounts: function (badgeCounts) {
      for (let sourceKey in badgeCounts) {
        if (badgeCounts.hasOwnProperty(sourceKey)) {
          const $source = this.getSourceByKey(sourceKey);
          if ($source) {
            let $badge = $source.children('.badge');
            if (badgeCounts[sourceKey] !== null) {
              if (!$badge.length) {
                $badge = $('<span class="badge"/>').appendTo($source);
              }
              $badge.text(badgeCounts[sourceKey]);
            } else if ($badge) {
              $badge.remove();
            }
          }
        }
      }
    },

    _countResults: function () {
      return new Promise((resolve, reject) => {
        if (this.totalResults !== null) {
          resolve(this.totalResults);
        } else {
          var params = this.getViewParams();
          delete params.criteria.offset;
          delete params.criteria.limit;

          // Make sure we've got an active result set ID
          if (this.resultSet === null) {
            this.resultSet = Math.floor(Math.random() * 100000000);
          }
          params.resultSet = this.resultSet;

          Craft.sendActionRequest('POST', this.settings.countElementsAction, {
            data: params,
            cancelToken: this._createCancelToken(),
          })
            .then((response) => {
              if (response.data.resultSet == this.resultSet) {
                this.totalResults = response.data.count;
                resolve(response.data.count);
              } else {
                reject();
              }
            })
            .catch(reject);
        }
      });
    },

    _createTriggers: function () {
      var triggers = [],
        safeMenuActions = [],
        destructiveMenuActions = [];

      var i;

      for (i = 0; i < this.actions.length; i++) {
        var action = this.actions[i];

        if (action.trigger) {
          var $form = $(
            '<form id="' +
              Craft.formatInputId(action.type) +
              '-actiontrigger"/>'
          )
            .data('action', action)
            .append(action.trigger);

          this.addListener($form, 'submit', '_handleActionTriggerSubmit');
          triggers.push($form);
        } else {
          if (!action.destructive) {
            safeMenuActions.push(action);
          } else {
            destructiveMenuActions.push(action);
          }
        }
      }

      var $btn;

      if (safeMenuActions.length || destructiveMenuActions.length) {
        var $menuTrigger = $('<form/>');

        $btn = $('<button/>', {
          type: 'button',
          class: 'btn menubtn',
          'data-icon': 'settings',
          title: Craft.t('app', 'Actions'),
        }).appendTo($menuTrigger);

        var $menu = $('<ul class="menu"/>').appendTo($menuTrigger),
          $safeList = this._createMenuTriggerList(safeMenuActions, false),
          $destructiveList = this._createMenuTriggerList(
            destructiveMenuActions,
            true
          );

        if ($safeList) {
          $safeList.appendTo($menu);
        }

        if ($safeList && $destructiveList) {
          $('<hr/>').appendTo($menu);
        }

        if ($destructiveList) {
          $destructiveList.appendTo($menu);
        }

        triggers.push($menuTrigger);
      }

      this._$triggers = $();

      for (i = 0; i < triggers.length; i++) {
        var $div = $('<div/>').append(triggers[i]);
        this._$triggers = this._$triggers.add($div);
      }

      this._$triggers.appendTo(this.$toolbar);
      Craft.appendHeadHtml(this.actionsHeadHtml);
      Craft.appendBodyHtml(this.actionsBodyHtml);

      Craft.initUiElements(this._$triggers);

      if ($btn) {
        $btn
          .data('menubtn')
          .on('optionSelect', this._handleMenuActionTriggerSubmit.bind(this));
      }
    },

    _showExportHud: function () {
      this.$exportBtn.addClass('active');
      this.$exportBtn.attr('aria-expanded', 'true');

      var $form = $('<form/>', {
        class: 'export-form',
      });

      var typeOptions = [];
      for (var i = 0; i < this.exporters.length; i++) {
        typeOptions.push({
          label: this.exporters[i].name,
          value: this.exporters[i].type,
        });
      }
      var $typeField = Craft.ui
        .createSelectField({
          label: Craft.t('app', 'Export Type'),
          options: typeOptions,
          class: 'fullwidth',
        })
        .appendTo($form);

      var $formatField = Craft.ui
        .createSelectField({
          label: Craft.t('app', 'Format'),
          options: [
            {label: 'CSV', value: 'csv'},
            {label: 'JSON', value: 'json'},
            {label: 'XML', value: 'xml'},
          ],
          class: 'fullwidth',
        })
        .appendTo($form);

      let $typeSelect = $typeField.find('select');
      this.addListener($typeSelect, 'change', () => {
        let type = $typeSelect.val();
        if (this.exportersByType[type].formattable) {
          $formatField.removeClass('hidden');
        } else {
          $formatField.addClass('hidden');
        }
      });
      $typeSelect.trigger('change');

      // Only show the Limit field if there aren't any selected elements
      var selectedElementIds = this.view.getSelectedElementIds();

      if (!selectedElementIds.length) {
        var $limitField = Craft.ui
          .createTextField({
            label: Craft.t('app', 'Limit'),
            placeholder: Craft.t('app', 'No limit'),
            type: 'number',
            min: 1,
          })
          .appendTo($form);
      }

      const $submitBtn = Craft.ui
        .createSubmitButton({
          class: 'fullwidth',
          label: Craft.t('app', 'Export'),
          spinner: true,
        })
        .appendTo($form);

      var hud = new Garnish.HUD(this.$exportBtn, $form);

      hud.on('hide', () => {
        this.$exportBtn.removeClass('active');
        this.$exportBtn.attr('aria-expanded', 'false');
      });

      var submitting = false;

      this.addListener($form, 'submit', function (ev) {
        ev.preventDefault();
        if (submitting) {
          return;
        }

        submitting = true;
        $submitBtn.addClass('loading');

        var params = this.getViewParams();
        delete params.criteria.offset;
        delete params.criteria.limit;
        delete params.collapsedElementIds;

        params.type = $typeField.find('select').val();
        params.format = $formatField.find('select').val();

        if (selectedElementIds.length) {
          params.criteria.id = selectedElementIds;
        } else {
          var limit = parseInt($limitField.find('input').val());
          if (limit && !isNaN(limit)) {
            params.criteria.limit = limit;
          }
        }

        if (Craft.csrfTokenValue) {
          params[Craft.csrfTokenName] = Craft.csrfTokenValue;
        }

        Craft.downloadFromUrl(
          'POST',
          Craft.getActionUrl('element-indexes/export'),
          params
        )
          .catch(() => {
            if (!this._ignoreFailedRequest) {
              Craft.cp.displayError(Craft.t('app', 'A server error occurred.'));
            }
          })
          .finally(() => {
            submitting = false;
            $submitBtn.removeClass('loading');
          });
      });
    },

    _createMenuTriggerList: function (actions, destructive) {
      if (actions && actions.length) {
        var $ul = $('<ul/>');

        for (var i = 0; i < actions.length; i++) {
          $('<li/>')
            .append(
              $('<a/>', {
                id: Craft.formatInputId(actions[i].type) + '-actiontrigger',
                class: destructive ? 'error' : null,
                data: {
                  action: actions[i],
                },
                text: actions[i].name,
              })
            )
            .appendTo($ul);
        }

        return $ul;
      }
    },

    showFilterHud: function () {
      if (!this.filterHuds[this.siteId]) {
        this.filterHuds[this.siteId] = {};
      }
      if (!this.filterHuds[this.siteId][this.sourceKey]) {
        this.filterHuds[this.siteId][this.sourceKey] = new FilterHud(
          this,
          this.sourceKey,
          this.siteId
        );
        this.updateFilterBtn();
      } else {
        this.filterHuds[this.siteId][this.sourceKey].show();
      }
    },

    updateFilterBtn: function () {
      this.$filterBtn.removeClass('active');

      if (
        this.filterHuds[this.siteId] &&
        this.filterHuds[this.siteId][this.sourceKey]
      ) {
        this.$filterBtn
          .attr(
            'aria-controls',
            this.filterHuds[this.siteId][this.sourceKey].id
          )
          .attr(
            'aria-expanded',
            this.filterHuds[this.siteId][this.sourceKey].showing
              ? 'true'
              : 'false'
          );

        if (
          this.filterHuds[this.siteId][this.sourceKey].showing ||
          this.filterHuds[this.siteId][this.sourceKey].hasRules()
        ) {
          this.$filterBtn.addClass('active');
        }
      } else {
        this.$filterBtn.attr('aria-controls', null);
      }
    },
  },
  {
    defaults: {
      context: 'index',
      modal: null,
      storageKey: null,
      condition: null,
      criteria: null,
      batchSize: 100,
      disabledElementIds: [],
      selectable: false,
      multiSelect: false,
      buttonContainer: null,
      hideSidebar: false,
      toolbarSelector: '.toolbar:first',
      refreshSourcesAction: 'element-indexes/get-source-tree-html',
      updateElementsAction: 'element-indexes/get-elements',
      countElementsAction: 'element-indexes/count-elements',
      submitActionsAction: 'element-indexes/perform-action',
      defaultSiteId: null,
      defaultSource: null,
      canHaveDrafts: false,

      elementTypeName: Craft.t('app', 'Element'),
      elementTypePluralName: Craft.t('app', 'Elements'),

      onAfterInit: $.noop,
      onSelectSource: $.noop,
      onSelectSite: $.noop,
      onUpdateElements: $.noop,
      onSelectionChange: $.noop,
      onEnableElements: $.noop,
      onDisableElements: $.noop,
      onAfterAction: $.noop,
    },
  }
);

const FilterHud = Garnish.HUD.extend({
  elementIndex: null,
  sourceKey: null,
  siteId: null,
  id: null,
  loading: true,
  serialized: null,
  $clearBtn: null,
  cleared: false,

  init: function (elementIndex, sourceKey, siteId) {
    this.elementIndex = elementIndex;
    this.sourceKey = sourceKey;
    this.siteId = siteId;
    this.id = `filter-${Math.floor(Math.random() * 1000000000)}`;

    const $loadingContent = $('<div/>')
      .append(
        $('<div/>', {
          class: 'spinner',
        })
      )
      .append(
        $('<div/>', {
          text: Craft.t('app', 'Loading'),
          class: 'visually-hidden',
          'aria-role': 'alert',
        })
      );

    this.base(this.elementIndex.$filterBtn, $loadingContent, {
      hudClass: 'hud element-filter-hud loading',
    });

    this.$hud.attr({
      id: this.id,
      'aria-live': 'polite',
      'aria-busy': 'false',
    });
    this.$tip.remove();
    this.$tip = null;

    this.$body.on('submit', (ev) => {
      ev.preventDefault();
      this.hide();
    });

    Craft.sendActionRequest('POST', 'element-indexes/filter-hud', {
      data: {
        elementType: this.elementIndex.elementType,
        source: this.sourceKey,
        condition: this.elementIndex.settings.condition,
        id: `${this.id}-filters`,
      },
    })
      .then((response) => {
        this.loading = false;
        this.$hud.removeClass('loading');
        $loadingContent.remove();

        this.$main.append(response.data.hudHtml);
        Craft.appendHeadHtml(response.data.headHtml);
        Craft.appendBodyHtml(response.data.bodyHtml);

        const $btnContainer = $('<div/>', {
          class: 'flex flex-nowrap',
        }).appendTo(this.$main);
        $('<div/>', {
          class: 'flex-grow',
        }).appendTo($btnContainer);
        this.$clearBtn = $('<button/>', {
          type: 'button',
          class: 'btn',
          text: Craft.t('app', 'Cancel'),
        }).appendTo($btnContainer);
        $('<button/>', {
          type: 'submit',
          class: 'btn secondary',
          text: Craft.t('app', 'Apply'),
        }).appendTo($btnContainer);
        this.$clearBtn.on('click', () => {
          this.clear();
        });

        this.$hud.find('.condition-container').on('htmx:beforeRequest', () => {
          this.setBusy();
        });

        this.$hud.find('.condition-container').on('htmx:load', () => {
          this.setReady();
        });
        this.setFocus();
      })
      .catch(() => {
        Craft.cp.displayError(Craft.t('app', 'A server error occurred.'));
      });

    this.$hud.css('position', 'fixed');

    this.addListener(Garnish.$win, 'scroll,resize', () => {
      this.updateSizeAndPosition(true);
    });
  },

  addListener: function (elem, events, data, func) {
    if (elem === this.$main && events === 'resize') {
      return;
    }
    this.base(elem, events, data, func);
  },

  setBusy: function () {
    this.$hud.attr('aria-busy', 'true');

    $('<div/>', {
      class: 'visually-hidden',
      text: Craft.t('app', 'Loading'),
    }).insertAfter(this.$main.find('.htmx-indicator'));
  },

  setReady: function () {
    this.$hud.attr('aria-busy', 'false');
  },

  setFocus: function () {
    Garnish.setFocusWithin(this.$main);
  },

  clear: function () {
    this.cleared = true;
    this.hide();
  },

  updateSizeAndPositionInternal: function () {
    // const searchOffset = this.elementIndex.$searchContainer.offset();
    const searchOffset =
      this.elementIndex.$searchContainer[0].getBoundingClientRect();

    this.$hud.css({
      width: this.elementIndex.$searchContainer.outerWidth() - 2,
      top: searchOffset.top + this.elementIndex.$searchContainer.outerHeight(),
      left: searchOffset.left + 1,
    });
  },

  onShow: function () {
    this.base();

    // Cancel => Clear
    if (this.$clearBtn) {
      this.$clearBtn.text(Craft.t('app', 'Clear'));
    }

    this.elementIndex.updateFilterBtn();
    this.setFocus();
  },

  onHide: function () {
    this.base();

    // If something changed, update the elements
    if (this.serialized !== (this.serialized = this.serialize())) {
      this.elementIndex.updateElements();
    }

    if (this.cleared) {
      this.destroy();
    } else {
      this.$hud.detach();
      this.$shade.detach();
    }

    this.elementIndex.updateFilterBtn();
    this.elementIndex.$filterBtn.focus();
  },

  hasRules: function () {
    return this.$main.has('.condition-rule').length !== 0;
  },

  serialize: function () {
    return !this.cleared && this.hasRules() ? this.$body.serialize() : null;
  },

  destroy: function () {
    this.base();
    delete this.elementIndex.filterHuds[this.siteId][this.sourceKey];
  },
});
