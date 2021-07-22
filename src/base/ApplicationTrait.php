<?php
/**
 * @link https://craftcms.com/
 * @copyright Copyright (c) Pixel & Tonic, Inc.
 * @license https://craftcms.github.io/license/
 */

namespace craft\base;

use Craft;
use craft\console\Application as ConsoleApplication;
use craft\console\Request as ConsoleRequest;
use craft\db\Connection;
use craft\db\MigrationManager;
use craft\db\Query;
use craft\db\Table;
use craft\elements\Asset;
use craft\elements\Category;
use craft\elements\Entry;
use craft\elements\Tag;
use craft\errors\DbConnectException;
use craft\errors\SiteNotFoundException;
use craft\errors\WrongEditionException;
use craft\events\DefineFieldLayoutFieldsEvent;
use craft\events\DeleteSiteEvent;
use craft\events\EditionChangeEvent;
use craft\events\FieldEvent;
use craft\fieldlayoutelements\AssetTitleField;
use craft\fieldlayoutelements\EntryTitleField;
use craft\fieldlayoutelements\TitleField;
use craft\helpers\App;
use craft\helpers\Db;
use craft\helpers\Session;
use craft\i18n\Formatter;
use craft\i18n\I18N;
use craft\i18n\Locale;
use craft\mail\Mailer;
use craft\models\FieldLayout;
use craft\models\Info;
use craft\queue\QueueInterface;
use craft\services\Announcements;
use craft\services\Api;
use craft\services\AssetIndexer;
use craft\services\Assets;
use craft\services\AssetTransforms;
use craft\services\Categories;
use craft\services\Composer;
use craft\services\Config;
use craft\services\Content;
use craft\services\Dashboard;
use craft\services\Deprecator;
use craft\services\Drafts;
use craft\services\ElementIndexes;
use craft\services\Elements;
use craft\services\Entries;
use craft\services\Fields;
use craft\services\Gc;
use craft\services\Globals;
use craft\services\Gql;
use craft\services\Images;
use craft\services\Matrix;
use craft\services\Path;
use craft\services\Plugins;
use craft\services\PluginStore;
use craft\services\ProjectConfig;
use craft\services\Relations;
use craft\services\Revisions;
use craft\services\Routes;
use craft\services\Search;
use craft\services\Sections;
use craft\services\Security;
use craft\services\Sites;
use craft\services\Structures;
use craft\services\SystemMessages;
use craft\services\Tags;
use craft\services\TemplateCaches;
use craft\services\Tokens;
use craft\services\Updates;
use craft\services\UserGroups;
use craft\services\UserPermissions;
use craft\services\Users;
use craft\services\Utilities;
use craft\services\Volumes;
use craft\web\Application as WebApplication;
use craft\web\AssetManager;
use craft\web\Request as WebRequest;
use craft\web\View;
use yii\base\Application;
use yii\base\ErrorHandler;
use yii\base\Event;
use yii\base\Exception;
use yii\base\InvalidConfigException;
use yii\caching\Cache;
use yii\db\Exception as DbException;
use yii\db\Expression;
use yii\mutex\Mutex;
use yii\queue\Queue;
use yii\web\ServerErrorHttpException;

/**
 * ApplicationTrait
 *
 * @property bool $isInstalled Whether Craft is installed
 * @property int $edition The active Craft edition
 * @property-read Announcements $announcements The announcements service
 * @property-read Api $api The API service
 * @property-read AssetIndexer $assetIndexer The asset indexer service
 * @property-read AssetManager $assetManager The asset manager component
 * @property-read AssetTransforms $assetTransforms The asset transforms service
 * @property-read Assets $assets The assets service
 * @property-read Categories $categories The categories service
 * @property-read Composer $composer The Composer service
 * @property-read Config $config The config service
 * @property-read Connection $db The database connection component
 * @property-read Content $content The content service
 * @property-read Dashboard $dashboard The dashboard service
 * @property-read Deprecator $deprecator The deprecator service
 * @property-read Drafts $drafts The drafts service
 * @property-read ElementIndexes $elementIndexes The element indexes service
 * @property-read Elements $elements The elements service
 * @property-read Entries $entries The entries service
 * @property-read Fields $fields The fields service
 * @property-read Formatter $formatter The formatter component
 * @property-read Gc $gc The garbage collection service
 * @property-read Globals $globals The globals service
 * @property-read Gql $gql The GraphQl service
 * @property-read I18N $i18n The internationalization (i18n) component
 * @property-read Images $images The images service
 * @property-read Locale $formattingLocale The Locale object that should be used to define the formatter
 * @property-read Locale $locale The Locale object for the target language
 * @property-read Mailer $mailer The mailer component
 * @property-read Matrix $matrix The matrix service
 * @property-read MigrationManager $contentMigrator The content migration manager
 * @property-read MigrationManager $migrator The application’s migration manager
 * @property-read Mutex $mutex The application’s mutex service
 * @property-read Path $path The path service
 * @property-read PluginStore $pluginStore The plugin store service
 * @property-read Plugins $plugins The plugins service
 * @property-read ProjectConfig $projectConfig The project config service
 * @property-read Queue|QueueInterface $queue The job queue
 * @property-read Relations $relations The relations service
 * @property-read Revisions $revisions The revisions service
 * @property-read Routes $routes The routes service
 * @property-read Search $search The search service
 * @property-read Sections $sections The sections service
 * @property-read Security $security The security component
 * @property-read Sites $sites The sites service
 * @property-read Structures $structures The structures service
 * @property-read SystemMessages $systemMessages The system email messages service
 * @property-read Tags $tags The tags service
 * @property-read TemplateCaches $templateCaches The template caches service
 * @property-read Tokens $tokens The tokens service
 * @property-read Updates $updates The updates service
 * @property-read UserGroups $userGroups The user groups service
 * @property-read UserPermissions $userPermissions The user permissions service
 * @property-read Users $users The users service
 * @property-read Utilities $utilities The utilities service
 * @property-read View $view The view component
 * @property-read Volumes $volumes The volumes service
 * @property-read bool $canTestEditions Whether Craft is running on a domain that is eligible to test out the editions
 * @property-read bool $canUpgradeEdition Whether Craft is eligible to be upgraded to a different edition
 * @property-read bool $hasWrongEdition Whether Craft is running with the wrong edition
 * @property-read bool $isInMaintenanceMode Whether someone is currently performing a system update
 * @property-read bool $isInitialized Whether Craft is fully initialized
 * @property-read bool $isMultiSite Whether this site has multiple sites
 * @property-read bool $isSystemLive Whether the system is live
 * @property-read string $installedSchemaVersion The installed schema version
 * @method AssetManager getAssetManager() Returns the asset manager component.
 * @method Connection getDb() Returns the database connection component.
 * @method Formatter getFormatter() Returns the formatter component.
 * @method I18N getI18n() Returns the internationalization (i18n) component.
 * @method Security getSecurity() Returns the security component.
 * @method View getView() Returns the view component.
 * @mixin WebApplication
 * @mixin ConsoleApplication
 * @author Pixel & Tonic, Inc. <support@pixelandtonic.com>
 * @since 3.0.0
 */
trait ApplicationTrait
{
    /**
     * @var string|null Craft’s schema version number.
     */
    public ?string $schemaVersion;

    /**
     * @var string|null The minimum Craft build number required to update to this build.
     */
    public ?string $minVersionRequired;

    /**
     * @var string|null The environment ID Craft is currently running in.
     */
    public ?string $env;

    /**
     * @var string The base Craftnet API URL to use.
     * @since 3.3.16
     * @internal
     */
    public string $baseApiUrl = 'https://api.craftcms.com/v1/';

    /**
     * @var string[]|null Query params that should be appended to Craftnet API requests.
     * @since 3.3.16
     * @internal
     */
    public ?array $apiParams;

    /**
     * @var
     */
    private bool $_isInstalled;

    /**
     * @var bool Whether the application is fully initialized yet
     * @see getIsInitialized()
     */
    private bool $_isInitialized = false;

    /**
     * @var bool
     * @see getIsMultiSite()
     */
    private bool $_isMultiSite;

    /**
     * @var bool
     * @see getIsMultiSite()
     */
    private bool $_isMultiSiteWithTrashed;

    /**
     * @var int|null The Craft edition
     * @see getEdition()
     */
    private ?int $_edition;

    /**
     * @var
     */
    private Info $_info;

    /**
     * @var bool|null
     */
    private ?bool $_isDbConfigValid;

    /**
     * @var bool
     */
    private bool $_gettingLanguage = false;

    /**
     * @var bool Whether we’re listening for the request end, to update the application info
     * @see saveInfoAfterRequest()
     */
    private bool $_waitingToSaveInfo = false;

    /**
     * Sets the target application language.
     *
     * @param bool|null $useUserLanguage Whether the user's preferred language should be used.
     * If null, the user’s preferred language will be used if this is a control panel request or a console request.
     */
    public function updateTargetLanguage(?bool $useUserLanguage = null): void
    {
        // Defend against an infinite updateTargetLanguage() loop
        if ($this->_gettingLanguage === true) {
            // We tried to get the language, but something went wrong. Use fallback to prevent infinite loop.
            $fallbackLanguage = $this->_getFallbackLanguage();
            $this->_gettingLanguage = false;
            $this->language = $fallbackLanguage;
            return;
        }

        $this->_gettingLanguage = true;

        if ($useUserLanguage === null) {
            $useUserLanguage = $this->getRequest()->getIsCpRequest();
        }

        $this->language = $this->getTargetLanguage($useUserLanguage);
        $this->_gettingLanguage = false;
    }

    /**
     * Returns the target app language.
     *
     * @param bool $useUserLanguage Whether the user's preferred language should be used.
     * @return string
     */
    public function getTargetLanguage(bool $useUserLanguage = true): string
    {
        // Use the fallback language for console requests, or if Craft isn't installed or is updating
        if (
            $this instanceof ConsoleApplication ||
            !$this->getIsInstalled() ||
            $this->getUpdates()->getIsCraftDbMigrationNeeded()
        ) {
            return $this->_getFallbackLanguage();
        }

        if ($useUserLanguage) {
            // If the user is logged in *and* has a primary language set, use that
            // (don't actually try to fetch the user, as plugins haven't been loaded yet)
            $id = Session::get($this->getUser()->idParam);
            if (
                $id &&
                ($language = $this->getUsers()->getUserPreference($id, 'language')) !== null &&
                Craft::$app->getI18n()->validateAppLocaleId($language)
            ) {
                return $language;
            }

            // Fall back on the default CP language, if there is one, otherwise the browser language
            return Craft::$app->getConfig()->getGeneral()->defaultCpLanguage ?? $this->_getFallbackLanguage();
        }

        /** @noinspection PhpUnhandledExceptionInspection */
        return $this->getSites()->getCurrentSite()->language;
    }

    /**
     * Returns whether Craft is installed.
     *
     * @param bool $refresh
     * @return bool
     */
    public function getIsInstalled(bool $refresh = false): bool
    {
        if ($refresh) {
            $this->_isInstalled = null;
            $this->_info = null;
        }

        if (isset($this->_isInstalled)) {
            return $this->_isInstalled;
        }

        if (!$this->getIsDbConnectionValid()) {
            return $this->_isInstalled = false;
        }

        try {
            $info = $this->getInfo(true);
        } catch (DbException | ServerErrorHttpException $e) {
            // yii2-redis awkwardly throws yii\db\Exception's rather than their own exception class.
            if ($e instanceof DbException && strpos($e->getMessage(), 'Redis') !== false) {
                throw $e;
            }

            Craft::error('There was a problem fetching the info row: ' . $e->getMessage(), __METHOD__);
            /** @var ErrorHandler $errorHandler */
            $errorHandler = $this->getErrorHandler();
            $errorHandler->logException($e);
            return $this->_isInstalled = false;
        }

        return $this->_isInstalled = !empty($info->id);
    }

    /**
     * Sets Craft's record of whether it's installed
     *
     * @param bool|null $value
     */
    public function setIsInstalled(?bool $value = true): void
    {
        $this->_isInstalled = $value;
    }

    /**
     * Returns the installed schema version.
     *
     * @return string
     * @since 3.2.0
     */
    public function getInstalledSchemaVersion(): string
    {
        return $this->getInfo()->schemaVersion ?: $this->schemaVersion;
    }

    /**
     * Returns whether Craft has been fully initialized.
     *
     * @return bool
     * @since 3.0.13
     */
    public function getIsInitialized(): bool
    {
        return $this->_isInitialized;
    }

    /**
     * Returns whether this Craft install has multiple sites.
     *
     * @param bool $refresh Whether to ignore the cached result and check again
     * @param bool $withTrashed Whether to factor in soft-deleted sites
     * @return bool
     */
    public function getIsMultiSite(bool $refresh = false, bool $withTrashed = false): bool
    {
        if ($withTrashed) {
            if (!$refresh && isset($this->_isMultiSiteWithTrashed)) {
                return $this->_isMultiSiteWithTrashed;
            }
            // This is a ridiculous microoptimization for the `sites` table, but all we need to know is whether there is
            // 1 or "more than 1" rows, and this is the fastest way to do it.
            // (https://stackoverflow.com/a/14916838/1688568)
            return $this->_isMultiSiteWithTrashed = (new Query())
                    ->from([
                        'x' => (new Query)
                            ->select([new Expression('1')])
                            ->from([Table::SITES])
                            ->limit(2),
                    ])
                    ->count() != 1;
        }

        if (!$refresh && isset($this->_isMultiSite)) {
            return $this->_isMultiSite;
        }
        return $this->_isMultiSite = (count($this->getSites()->getAllSites()) > 1);
    }

    /**
     * Returns the Craft edition.
     *
     * @return int
     */
    public function getEdition(): int
    {
        if (!isset($this->_edition)) {
            $handle = $this->getProjectConfig()->get('system.edition') ?? 'solo';
            $this->_edition = App::editionIdByHandle($handle);
        }
        return $this->_edition;
    }

    /**
     * Returns the name of the Craft edition.
     *
     * @return string
     */
    public function getEditionName(): string
    {
        return App::editionName($this->getEdition());
    }

    /**
     * Returns the edition Craft is actually licensed to run in.
     *
     * @return int|null
     */
    public function getLicensedEdition(): ?int
    {
        $licensedEdition = $this->getCache()->get('licensedEdition');

        if ($licensedEdition !== false) {
            return (int)$licensedEdition;
        }

        return null;
    }

    /**
     * Returns the name of the edition Craft is actually licensed to run in.
     *
     * @return string|null
     */
    public function getLicensedEditionName(): ?string
    {
        $licensedEdition = $this->getLicensedEdition();

        if ($licensedEdition !== null) {
            return App::editionName($licensedEdition);
        }

        return null;
    }

    /**
     * Returns whether Craft is running with the wrong edition.
     *
     * @return bool
     */
    public function getHasWrongEdition(): bool
    {
        $licensedEdition = $this->getLicensedEdition();

        return ($licensedEdition !== null && $licensedEdition !== $this->getEdition() && !$this->getCanTestEditions());
    }

    /**
     * Sets the Craft edition.
     *
     * @param int $edition The edition to set.
     * @return bool
     */
    public function setEdition(int $edition): bool
    {
        $oldEdition = $this->getEdition();
        $this->getProjectConfig()->set('system.edition', App::editionHandle($edition), "Craft CMS edition change");
        $this->_edition = $edition;

        // Fire an 'afterEditionChange' event
        /** @var WebRequest|ConsoleRequest $request */
        $request = $this->getRequest();
        if (!$request->getIsConsoleRequest() && $this->hasEventHandlers(WebApplication::EVENT_AFTER_EDITION_CHANGE)) {
            $this->trigger(WebApplication::EVENT_AFTER_EDITION_CHANGE, new EditionChangeEvent([
                'oldEdition' => $oldEdition,
                'newEdition' => $edition,
            ]));
        }

        return true;
    }

    /**
     * Requires that Craft is running an equal or better edition than what's passed in
     *
     * @param int $edition The Craft edition to require.
     * @param bool $orBetter If true, makes $edition the minimum edition required.
     * @throws WrongEditionException if attempting to do something not allowed by the current Craft edition
     */
    public function requireEdition(int $edition, bool $orBetter = true): void
    {
        if ($this->getIsInstalled() && !$this->getProjectConfig()->getIsApplyingYamlChanges()) {
            $installedEdition = $this->getEdition();

            if (($orBetter && $installedEdition < $edition) || (!$orBetter && $installedEdition !== $edition)) {
                $editionName = App::editionName($edition);
                throw new WrongEditionException("Craft {$editionName} is required for this");
            }
        }
    }

    /**
     * Returns whether Craft is eligible to be upgraded to a different edition.
     *
     * @return bool
     */
    public function getCanUpgradeEdition(): bool
    {
        // Only admin accounts can upgrade Craft
        if (
            $this->getUser()->getIsAdmin() &&
            Craft::$app->getConfig()->getGeneral()->allowAdminChanges
        ) {
            // Are they either *using* or *licensed to use* something < Craft Pro?
            $activeEdition = $this->getEdition();
            $licensedEdition = $this->getLicensedEdition();

            return (
                ($activeEdition < Craft::Pro) ||
                ($licensedEdition !== null && $licensedEdition < Craft::Pro)
            );
        }

        return false;
    }

    /**
     * Returns whether Craft is running on a domain that is eligible to test out the editions.
     *
     * @return bool
     */
    public function getCanTestEditions(): bool
    {
        $request = $this->getRequest();
        if ($request->getIsConsoleRequest()) {
            return false;
        }

        /** @var Cache $cache */
        $cache = $this->getCache();
        return $cache->get('editionTestableDomain@' . $request->getHostName());
    }

    /**
     * Returns the system's UID.
     *
     * @return string|null
     */
    public function getSystemUid(): ?string
    {
        return $this->getInfo()->uid;
    }

    /**
     * Returns whether the system is currently live.
     *
     * @return bool
     * @since 3.1.0
     */
    public function getIsLive(): bool
    {
        if (is_bool($live = $this->getConfig()->getGeneral()->isSystemLive)) {
            return $live;
        }

        return (bool)$this->getProjectConfig()->get('system.live');
    }

    /**
     * Returns whether someone is currently performing a system update.
     *
     * @return bool
     * @see enableMaintenanceMode()
     * @see disableMaintenanceMode()
     */
    public function getIsInMaintenanceMode(): bool
    {
        return (bool)$this->getInfo()->maintenance;
    }

    /**
     * Enables Maintenance Mode.
     *
     * @return bool
     * @see getIsInMaintenanceMode()
     * @see disableMaintenanceMode()
     */
    public function enableMaintenanceMode(): bool
    {
        return $this->_setMaintenanceMode(true);
    }

    /**
     * Disables Maintenance Mode.
     *
     * @return bool
     * @see getIsInMaintenanceMode()
     * @see disableMaintenanceMode()
     */
    public function disableMaintenanceMode(): bool
    {
        return $this->_setMaintenanceMode(false);
    }

    /**
     * Returns the info model, or just a particular attribute.
     *
     * @param bool $throwException Whether an exception should be thrown if the `info` table doesn't exist
     * @return Info
     * @throws DbException if the `info` table doesn’t exist yet and `$throwException` is `true`
     * @throws ServerErrorHttpException if the info table is missing its row
     */
    public function getInfo(bool $throwException = false): Info
    {
        if (isset($this->_info)) {
            return $this->_info;
        }

        try {
            $row = (new Query())
                ->from([Table::INFO])
                ->where(['id' => 1])
                ->one();
        } catch (DbException $e) {
            if ($throwException) {
                throw $e;
            }
            return $this->_info = new Info();
        } catch (DbConnectException $e) {
            if ($throwException) {
                throw $e;
            }
            return $this->_info = new Info();
        }

        if (!$row) {
            $tableName = $this->getDb()->getSchema()->getRawTableName(Table::INFO);
            throw new ServerErrorHttpException("The {$tableName} table is missing its row");
        }

        return $this->_info = new Info($row);
    }

    /**
     * Updates the info row at the end of the request.
     *
     * @since 3.1.33
     */
    public function saveInfoAfterRequest(): void
    {
        if (!$this->_waitingToSaveInfo) {
            $this->_waitingToSaveInfo = true;

            // If the request is already over, trigger this immediately
            if (in_array($this->state, [
                Application::STATE_AFTER_REQUEST,
                Application::STATE_SENDING_RESPONSE,
                Application::STATE_END,
            ], true)) {
                $this->saveInfoAfterRequestHandler();
            } else {
                Craft::$app->on(WebApplication::EVENT_AFTER_REQUEST, [$this, 'saveInfoAfterRequestHandler']);
            }
        }
    }

    /**
     * @throws Exception
     * @throws ServerErrorHttpException
     * @since 3.1.33
     * @internal
     */
    public function saveInfoAfterRequestHandler(): void
    {
        $info = $this->getInfo();
        if (!$this->saveInfo($info)) {
            throw new Exception("Unable to save new application info: " . implode(', ', $info->getErrorSummary(true)));
        }
        $this->_waitingToSaveInfo = false;
    }

    /**
     * Updates the info row.
     *
     * @param Info $info
     * @param string[]|null $attributeNames The attributes to save
     * @return bool
     */
    public function saveInfo(Info $info, ?array $attributeNames = null): bool
    {

        if ($attributeNames === null) {
            $attributeNames = ['version', 'schemaVersion', 'maintenance', 'fieldVersion'];
        }

        if (!$info->validate($attributeNames)) {
            return false;
        }

        $attributes = $info->getAttributes($attributeNames);

        $infoRowExists = (new Query())
            ->from([Table::INFO])
            ->where(['id' => 1])
            ->exists();

        if ($infoRowExists) {
            Db::update(Table::INFO, $attributes, [
                'id' => 1,
            ]);
        } else {
            Db::insert(Table::INFO, $attributes + [
                    'id' => 1,
                ]);
        }

        $this->setIsInstalled();

        // Use this as the new cached Info
        $this->_info = $info;

        return true;
    }

    /**
     * Returns the system name.
     *
     * @return string
     * @since 3.1.4
     */
    public function getSystemName(): string
    {
        if (($name = Craft::$app->getProjectConfig()->get('system.name')) !== null) {
            return Craft::parseEnv($name);
        }

        try {
            $name = $this->getSites()->getPrimarySite()->getName();
        } catch (SiteNotFoundException $e) {
            $name = null;
        }

        return $name ?: 'Craft';
    }

    /**
     * Returns the Yii framework version.
     *
     * @return string
     */
    public function getYiiVersion(): string
    {
        return \Yii::getVersion();
    }

    /**
     * Returns whether the DB connection settings are valid.
     *
     * @return bool
     * @internal Don't even think of moving this check into Connection->init().
     */
    public function getIsDbConnectionValid(): bool
    {
        $e = null;
        try {
            $this->getDb()->open();
        } catch (DbConnectException $e) {
            // throw it later
        } catch (InvalidConfigException $e) {
            // throw it later
        }

        if ($e !== null) {
            Craft::error('There was a problem connecting to the database: ' . $e->getMessage(), __METHOD__);
            /** @var ErrorHandler $errorHandler */
            $errorHandler = $this->getErrorHandler();
            $errorHandler->logException($e);
            return false;
        }

        return true;
    }

    // Service Getters
    // -------------------------------------------------------------------------

    /**
     * Returns the announcements service.
     *
     * @return Announcements The announcements service
     * @since 3.7.0
     */
    public function getAnnouncements(): Announcements
    {
        return $this->get('announcements');
    }

    /**
     * Returns the API service.
     *
     * @return Api The API service
     */
    public function getApi(): Api
    {
        return $this->get('api');
    }

    /**
     * Returns the assets service.
     *
     * @return Assets The assets service
     */
    public function getAssets(): Assets
    {
        return $this->get('assets');
    }

    /**
     * Returns the asset indexing service.
     *
     * @return AssetIndexer The asset indexing service
     */
    public function getAssetIndexer(): AssetIndexer
    {
        return $this->get('assetIndexer');
    }

    /**
     * Returns the asset transforms service.
     *
     * @return AssetTransforms The asset transforms service
     */
    public function getAssetTransforms(): AssetTransforms
    {
        return $this->get('assetTransforms');
    }

    /**
     * Returns the categories service.
     *
     * @return Categories The categories service
     */
    public function getCategories(): Categories
    {
        return $this->get('categories');
    }

    /**
     * Returns the Composer service.
     *
     * @return Composer The Composer service
     */
    public function getComposer(): Composer
    {
        return $this->get('composer');
    }

    /**
     * Returns the config service.
     *
     * @return Config The config service
     */
    public function getConfig(): Config
    {
        return $this->get('config');
    }

    /**
     * Returns the content service.
     *
     * @return Content The content service
     */
    public function getContent(): Content
    {
        return $this->get('content');
    }

    /**
     * Returns the content migration manager.
     *
     * @return MigrationManager The content migration manager
     */
    public function getContentMigrator(): MigrationManager
    {
        return $this->get('contentMigrator');
    }

    /**
     * Returns the dashboard service.
     *
     * @return Dashboard The dashboard service
     */
    public function getDashboard(): Dashboard
    {
        return $this->get('dashboard');
    }

    /**
     * Returns the deprecator service.
     *
     * @return Deprecator The deprecator service
     */
    public function getDeprecator(): Deprecator
    {
        return $this->get('deprecator');
    }

    /**
     * Returns the drafts service.
     *
     * @return Drafts The drafts service
     * @since 3.2.0
     */
    public function getDrafts(): Drafts
    {
        return $this->get('drafts');
    }

    /**
     * Returns the element indexes service.
     *
     * @return ElementIndexes The element indexes service
     */
    public function getElementIndexes(): ElementIndexes
    {
        return $this->get('elementIndexes');
    }

    /**
     * Returns the elements service.
     *
     * @return Elements The elements service
     */
    public function getElements(): Elements
    {
        return $this->get('elements');
    }

    /**
     * Returns the system email messages service.
     *
     * @return SystemMessages The system email messages service
     */
    public function getSystemMessages(): SystemMessages
    {
        return $this->get('systemMessages');
    }

    /**
     * Returns the entries service.
     *
     * @return Entries The entries service
     */
    public function getEntries(): Entries
    {
        return $this->get('entries');
    }

    /**
     * Returns the fields service.
     *
     * @return Fields The fields service
     */
    public function getFields(): Fields
    {
        return $this->get('fields');
    }

    /**
     * Returns the locale that should be used to define the formatter.
     *
     * @return Locale
     * @since 3.6.0
     */
    public function getFormattingLocale(): Locale
    {
        return $this->get('formattingLocale');
    }

    /**
     * Returns the garbage collection service.
     *
     * @return Gc The garbage collection service
     */
    public function getGc(): Gc
    {
        return $this->get('gc');
    }

    /**
     * Returns the globals service.
     *
     * @return Globals The globals service
     */
    public function getGlobals(): Globals
    {
        return $this->get('globals');
    }

    /**
     * Returns the GraphQL service.
     *
     * @return Gql The GraphQL service
     * @since 3.3.0
     */
    public function getGql(): Gql
    {
        return $this->get('gql');
    }

    /**
     * Returns the images service.
     *
     * @return Images The images service
     */
    public function getImages(): Images
    {
        return $this->get('images');
    }

    /**
     * Returns a Locale object for the target language.
     *
     * @return Locale The Locale object for the target language
     */
    public function getLocale(): Locale
    {
        return $this->get('locale');
    }

    /**
     * Returns the current mailer.
     *
     * @return Mailer The mailer component
     */
    public function getMailer(): Mailer
    {
        return $this->get('mailer');
    }

    /**
     * Returns the matrix service.
     *
     * @return Matrix The matrix service
     */
    public function getMatrix(): Matrix
    {
        return $this->get('matrix');
    }

    /**
     * Returns the application’s migration manager.
     *
     * @return MigrationManager The application’s migration manager
     */
    public function getMigrator(): MigrationManager
    {
        return $this->get('migrator');
    }

    /**
     * Returns the application’s mutex service.
     *
     * @return Mutex The application’s mutex service
     */
    public function getMutex(): Mutex
    {
        return $this->get('mutex');
    }

    /**
     * Returns the path service.
     *
     * @return Path The path service
     */
    public function getPath(): Path
    {
        return $this->get('path');
    }

    /**
     * Returns the plugins service.
     *
     * @return Plugins The plugins service
     */
    public function getPlugins(): Plugins
    {
        return $this->get('plugins');
    }

    /**
     * Returns the plugin store service.
     *
     * @return PluginStore The plugin store service
     */
    public function getPluginStore(): PluginStore
    {
        return $this->get('pluginStore');
    }

    /**
     * Returns the system config service.
     *
     * @return ProjectConfig The system config service
     */
    public function getProjectConfig(): ProjectConfig
    {
        return $this->get('projectConfig');
    }

    /**
     * Returns the queue service.
     *
     * @return Queue|QueueInterface The queue service
     */
    public function getQueue(): Queue
    {
        return $this->get('queue');
    }

    /**
     * Returns the relations service.
     *
     * @return Relations The relations service
     */
    public function getRelations(): Relations
    {
        return $this->get('relations');
    }

    /**
     * Returns the revisions service.
     *
     * @return Revisions The revisions service
     * @since 3.2.0
     */
    public function getRevisions(): Revisions
    {
        return $this->get('revisions');
    }

    /**
     * Returns the routes service.
     *
     * @return Routes The routes service
     */
    public function getRoutes(): Routes
    {
        return $this->get('routes');
    }

    /**
     * Returns the search service.
     *
     * @return Search The search service
     */
    public function getSearch(): Search
    {
        return $this->get('search');
    }

    /**
     * Returns the sections service.
     *
     * @return Sections The sections service
     */
    public function getSections(): Sections
    {
        return $this->get('sections');
    }

    /**
     * Returns the sites service.
     *
     * @return Sites The sites service
     */
    public function getSites(): Sites
    {
        return $this->get('sites');
    }

    /**
     * Returns the structures service.
     *
     * @return Structures The structures service
     */
    public function getStructures(): Structures
    {
        return $this->get('structures');
    }

    /**
     * Returns the tags service.
     *
     * @return Tags The tags service
     */
    public function getTags(): Tags
    {
        return $this->get('tags');
    }

    /**
     * Returns the template cache service.
     *
     * @return TemplateCaches The template caches service
     */
    public function getTemplateCaches(): TemplateCaches
    {
        return $this->get('templateCaches');
    }

    /**
     * Returns the tokens service.
     *
     * @return Tokens The tokens service
     */
    public function getTokens(): Tokens
    {
        return $this->get('tokens');
    }

    /**
     * Returns the updates service.
     *
     * @return Updates The updates service
     */
    public function getUpdates(): Updates
    {
        return $this->get('updates');
    }

    /**
     * Returns the user groups service.
     *
     * @return UserGroups The user groups service
     */
    public function getUserGroups(): UserGroups
    {
        return $this->get('userGroups');
    }

    /**
     * Returns the user permissions service.
     *
     * @return UserPermissions The user permissions service
     */
    public function getUserPermissions(): UserPermissions
    {
        return $this->get('userPermissions');
    }

    /**
     * Returns the users service.
     *
     * @return Users The users service
     */
    public function getUsers(): Users
    {
        return $this->get('users');
    }

    /**
     * Returns the utilities service.
     *
     * @return Utilities The utilities service
     */
    public function getUtilities(): Utilities
    {
        /** @var \craft\web\Application|\craft\console\Application $this */
        return $this->get('utilities');
    }

    /**
     * Returns the volumes service.
     *
     * @return Volumes The volumes service
     */
    public function getVolumes(): Volumes
    {
        return $this->get('volumes');
    }

    /**
     * Initializes things that should happen before the main Application::init()
     */
    private function _preInit(): void
    {
        // Load the request before anything else, so everything else can safely check Craft::$app->has('request', true)
        // to avoid possible recursive fatal errors in the request initialization
        $request = $this->getRequest();
        $this->getLog();

        // Set the timezone
        $this->_setTimeZone();

        // Set the language
        $this->updateTargetLanguage();

        // Prevent browser caching if this is a control panel request
        if ($request->getIsCpRequest()) {
            $this->getResponse()->setNoCacheHeaders();
        }
    }

    /**
     * Initializes things that should happen after the main Application::init()
     */
    private function _postInit(): void
    {
        // Register field layout listeners
        $this->_registerFieldLayoutListener();

        // Register all the listeners for config items
        $this->_registerConfigListeners();

        // Load the plugins
        $this->getPlugins()->loadPlugins();

        $this->_isInitialized = true;

        // Fire an 'init' event
        if ($this->hasEventHandlers(WebApplication::EVENT_INIT)) {
            $this->trigger(WebApplication::EVENT_INIT);
        }

        if ($this->getIsInstalled() && !$this->getUpdates()->getIsCraftDbMigrationNeeded()) {
            // Possibly run garbage collection
            $this->getGc()->run();
        }
    }

    /**
     * Sets the system timezone.
     */
    private function _setTimeZone(): void
    {
        $timezone = $this->getConfig()->getGeneral()->timezone;

        if (!$timezone) {
            $timezone = $this->getProjectConfig()->get('system.timeZone');
        }

        if ($timezone) {
            $this->setTimeZone($timezone);
        }
    }

    /**
     * Enables or disables Maintenance Mode
     *
     * @param bool $value
     * @return bool
     */
    private function _setMaintenanceMode(bool $value): bool
    {
        $info = $this->getInfo();
        if ((bool)$info->maintenance === $value) {
            return true;
        }
        $info->maintenance = $value;
        return $this->saveInfo($info);
    }

    /**
     * Tries to find a language match with the browser's preferred language(s).
     *
     * If not uses the app's sourceLanguage.
     *
     * @return string
     */
    private function _getFallbackLanguage(): string
    {
        // See if we have the CP translated in one of the user's browsers preferred language(s)
        if ($this instanceof WebApplication) {
            $languages = $this->getI18n()->getAppLocaleIds();
            return $this->getRequest()->getPreferredLanguage($languages);
        }

        // Default to the source language.
        return $this->sourceLanguage;
    }

    /**
     * Register event listeners for field layouts.
     */
    private function _registerFieldLayoutListener(): void
    {
        Event::on(FieldLayout::class, FieldLayout::EVENT_DEFINE_STANDARD_FIELDS, function(DefineFieldLayoutFieldsEvent $event) {
            /** @var FieldLayout $fieldLayout */
            $fieldLayout = $event->sender;

            switch ($fieldLayout->type) {
                case Category::class:
                case Tag::class:
                    $event->fields[] = TitleField::class;
                    break;
                case Asset::class:
                    $event->fields[] = AssetTitleField::class;
                    break;
                case Entry::class:
                    $event->fields[] = EntryTitleField::class;
                    break;
            }
        });
    }

    /**
     * Register event listeners for config changes.
     */
    private function _registerConfigListeners(): void
    {
        $this->getProjectConfig()
            // Field groups
            ->onAdd(Fields::CONFIG_FIELDGROUP_KEY . '.{uid}', $this->_proxy('fields', 'handleChangedGroup'))
            ->onUpdate(Fields::CONFIG_FIELDGROUP_KEY . '.{uid}', $this->_proxy('fields', 'handleChangedGroup'))
            ->onRemove(Fields::CONFIG_FIELDGROUP_KEY . '.{uid}', $this->_proxy('fields', 'handleDeletedGroup'))
            // Fields
            ->onAdd(Fields::CONFIG_FIELDS_KEY . '.{uid}', $this->_proxy('fields', 'handleChangedField'))
            ->onUpdate(Fields::CONFIG_FIELDS_KEY . '.{uid}', $this->_proxy('fields', 'handleChangedField'))
            ->onRemove(Fields::CONFIG_FIELDS_KEY . '.{uid}', $this->_proxy('fields', 'handleDeletedField'))
            // Block types
            ->onAdd(Matrix::CONFIG_BLOCKTYPE_KEY . '.{uid}', $this->_proxy('matrix', 'handleChangedBlockType'))
            ->onUpdate(Matrix::CONFIG_BLOCKTYPE_KEY . '.{uid}', $this->_proxy('matrix', 'handleChangedBlockType'))
            ->onRemove(Matrix::CONFIG_BLOCKTYPE_KEY . '.{uid}', $this->_proxy('matrix', 'handleDeletedBlockType'))
            // Volumes
            ->onAdd(Volumes::CONFIG_VOLUME_KEY . '.{uid}', $this->_proxy('volumes', 'handleChangedVolume'))
            ->onUpdate(Volumes::CONFIG_VOLUME_KEY . '.{uid}', $this->_proxy('volumes', 'handleChangedVolume'))
            ->onRemove(Volumes::CONFIG_VOLUME_KEY . '.{uid}', $this->_proxy('volumes', 'handleDeletedVolume'))
            // Transforms
            ->onAdd(AssetTransforms::CONFIG_TRANSFORM_KEY . '.{uid}', $this->_proxy('assetTransforms', 'handleChangedTransform'))
            ->onUpdate(AssetTransforms::CONFIG_TRANSFORM_KEY . '.{uid}', $this->_proxy('assetTransforms', 'handleChangedTransform'))
            ->onRemove(AssetTransforms::CONFIG_TRANSFORM_KEY . '.{uid}', $this->_proxy('assetTransforms', 'handleDeletedTransform'))
            // Site groups
            ->onAdd(Sites::CONFIG_SITEGROUP_KEY . '.{uid}', $this->_proxy('sites', 'handleChangedGroup'))
            ->onUpdate(Sites::CONFIG_SITEGROUP_KEY . '.{uid}', $this->_proxy('sites', 'handleChangedGroup'))
            ->onRemove(Sites::CONFIG_SITEGROUP_KEY . '.{uid}', $this->_proxy('sites', 'handleDeletedGroup'))
            // Sites
            ->onAdd(Sites::CONFIG_SITES_KEY . '.{uid}', $this->_proxy('sites', 'handleChangedSite'))
            ->onUpdate(Sites::CONFIG_SITES_KEY . '.{uid}', $this->_proxy('sites', 'handleChangedSite'))
            ->onRemove(Sites::CONFIG_SITES_KEY . '.{uid}', $this->_proxy('sites', 'handleDeletedSite'))
            // Tags
            ->onAdd(Tags::CONFIG_TAGGROUP_KEY . '.{uid}', $this->_proxy('tags', 'handleChangedTagGroup'))
            ->onUpdate(Tags::CONFIG_TAGGROUP_KEY . '.{uid}', $this->_proxy('tags', 'handleChangedTagGroup'))
            ->onRemove(Tags::CONFIG_TAGGROUP_KEY . '.{uid}', $this->_proxy('tags', 'handleDeletedTagGroup'))
            // Categories
            ->onAdd(Categories::CONFIG_CATEGORYROUP_KEY . '.{uid}', $this->_proxy('categories', 'handleChangedCategoryGroup'))
            ->onUpdate(Categories::CONFIG_CATEGORYROUP_KEY . '.{uid}', $this->_proxy('categories', 'handleChangedCategoryGroup'))
            ->onRemove(Categories::CONFIG_CATEGORYROUP_KEY . '.{uid}', $this->_proxy('categories', 'handleDeletedCategoryGroup'))
            // User group permissions
            ->onAdd(UserGroups::CONFIG_USERPGROUPS_KEY . '.{uid}.permissions', $this->_proxy('userPermissions', 'handleChangedGroupPermissions'))
            ->onUpdate(UserGroups::CONFIG_USERPGROUPS_KEY . '.{uid}.permissions', $this->_proxy('userPermissions', 'handleChangedGroupPermissions'))
            ->onRemove(UserGroups::CONFIG_USERPGROUPS_KEY . '.{uid}.permissions', $this->_proxy('userPermissions', 'handleChangedGroupPermissions'))
            // User groups
            ->onAdd(UserGroups::CONFIG_USERPGROUPS_KEY . '.{uid}', $this->_proxy('userGroups', 'handleChangedUserGroup'))
            ->onUpdate(UserGroups::CONFIG_USERPGROUPS_KEY . '.{uid}', $this->_proxy('userGroups', 'handleChangedUserGroup'))
            ->onRemove(UserGroups::CONFIG_USERPGROUPS_KEY . '.{uid}', $this->_proxy('userGroups', 'handleDeletedUserGroup'))
            // User field layout
            ->onAdd(Users::CONFIG_USERLAYOUT_KEY, $this->_proxy('users', 'handleChangedUserFieldLayout'))
            ->onUpdate(Users::CONFIG_USERLAYOUT_KEY, $this->_proxy('users', 'handleChangedUserFieldLayout'))
            ->onRemove(Users::CONFIG_USERLAYOUT_KEY, $this->_proxy('users', 'handleChangedUserFieldLayout'))
            // Global sets
            ->onAdd(Globals::CONFIG_GLOBALSETS_KEY . '.{uid}', $this->_proxy('globals', 'handleChangedGlobalSet'))
            ->onUpdate(Globals::CONFIG_GLOBALSETS_KEY . '.{uid}', $this->_proxy('globals', 'handleChangedGlobalSet'))
            ->onRemove(Globals::CONFIG_GLOBALSETS_KEY . '.{uid}', $this->_proxy('globals', 'handleDeletedGlobalSet'))
            // Sections
            ->onAdd(Sections::CONFIG_SECTIONS_KEY . '.{uid}', $this->_proxy('sections', 'handleChangedSection'))
            ->onUpdate(Sections::CONFIG_SECTIONS_KEY . '.{uid}', $this->_proxy('sections', 'handleChangedSection'))
            ->onRemove(Sections::CONFIG_SECTIONS_KEY . '.{uid}', $this->_proxy('sections', 'handleDeletedSection'))
            // Entry types
            ->onAdd(Sections::CONFIG_ENTRYTYPES_KEY . '.{uid}', $this->_proxy('sections', 'handleChangedEntryType'))
            ->onUpdate(Sections::CONFIG_ENTRYTYPES_KEY . '.{uid}', $this->_proxy('sections', 'handleChangedEntryType'))
            ->onRemove(Sections::CONFIG_ENTRYTYPES_KEY . '.{uid}', $this->_proxy('sections', 'handleDeletedEntryType'))
            // GraphQL schemas
            ->onAdd(Gql::CONFIG_GQL_SCHEMAS_KEY . '.{uid}', $this->_proxy('gql', 'handleChangedSchema'))
            ->onUpdate(Gql::CONFIG_GQL_SCHEMAS_KEY . '.{uid}', $this->_proxy('gql', 'handleChangedSchema'))
            ->onRemove(Gql::CONFIG_GQL_SCHEMAS_KEY . '.{uid}', $this->_proxy('gql', 'handleDeletedSchema'))
            // GraphQL public token
            ->onAdd(Gql::CONFIG_GQL_PUBLIC_TOKEN_KEY, $this->_proxy('gql', 'handleChangedPublicToken'))
            ->onUpdate(Gql::CONFIG_GQL_PUBLIC_TOKEN_KEY, $this->_proxy('gql', 'handleChangedPublicToken'));

        // Prune deleted fields from their layouts
        Event::on(Fields::class, Fields::EVENT_AFTER_DELETE_FIELD, function(FieldEvent $event) {
            $this->getVolumes()->pruneDeletedField($event);
            $this->getTags()->pruneDeletedField($event);
            $this->getCategories()->pruneDeletedField($event);
            $this->getUsers()->pruneDeletedField($event);
            $this->getGlobals()->pruneDeletedField($event);
            $this->getSections()->pruneDeletedField($event);
        });

        // Prune deleted sites from site settings
        Event::on(Sites::class, Sites::EVENT_AFTER_DELETE_SITE, function(DeleteSiteEvent $event) {
            $this->getRoutes()->handleDeletedSite($event);
            $this->getCategories()->pruneDeletedSite($event);
            $this->getSections()->pruneDeletedSite($event);
        });
    }

    /**
     * Returns a proxy function for calling a component method, based on its ID.
     *
     * The component won’t be fetched until the method is called, avoiding unnecessary component instantiation, and ensuring the correct component
     * is called if it happens to get swapped out (e.g. for a test).
     *
     * @param string $id The component ID
     * @param string $method The method name
     * @return callable
     */
    private function _proxy(string $id, string $method): callable
    {
        return function() use ($id, $method) {
            return $this->get($id)->$method(...func_get_args());
        };
    }
}
