import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Register for remote (APNs) notifications.
        // @capacitor/push-notifications handles UNUserNotificationCenter permission prompts.
        // This call is safe to make here — it's a no-op if the user hasn't granted permission yet.
        application.registerForRemoteNotifications()
        return true
    }

    // ── APNs token forwarding ────────────────────────────────────────────────
    // Capacitor's push-notifications plugin needs these callbacks wired through
    // ApplicationDelegateProxy so it can forward the token to Firebase (FCM).

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(
            name: NSNotification.Name("didRegisterForRemoteNotificationsWithDeviceToken"),
            object: deviceToken
        )
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(
            name: NSNotification.Name("didFailToRegisterForRemoteNotificationsWithError"),
            object: error
        )
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    func applicationWillResignActive(_ application: UIApplication) {}

    func applicationDidEnterBackground(_ application: UIApplication) {}

    func applicationWillEnterForeground(_ application: UIApplication) {}

    func applicationDidBecomeActive(_ application: UIApplication) {}

    func applicationWillTerminate(_ application: UIApplication) {}

    // ── URL / Universal Links ────────────────────────────────────────────────

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
