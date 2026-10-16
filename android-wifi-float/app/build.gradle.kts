import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun signingValue(name: String): String? = System.getenv(name) ?: keystoreProps.getProperty(name)
val customKeystore = signingValue("KEYSTORE_FILE")?.let { rootProject.file(it) }?.takeIf { it.exists() }

android {
    namespace = "pl.tablet.wififloat"
    compileSdk = 34

    defaultConfig {
        applicationId = "pl.tablet.wififloat"
        minSdk = 26
        // Jak MacroDroid Helper: targetSdk < 29, żeby WifiManager.setWifiEnabled()
        // działało na Android 10+ (Google blokuje to dopiero od target 29).
        // Aplikacja jest do sideloadu / ADB, nie na Play Store.
        targetSdk = 28
        versionCode = 2
        versionName = "1.1"
    }

    signingConfigs {
        if (customKeystore != null) {
            create("custom") {
                storeFile = customKeystore
                storePassword = signingValue("KEYSTORE_PASSWORD")
                keyAlias = signingValue("KEY_ALIAS")
                keyPassword = signingValue("KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (customKeystore != null) signingConfigs.getByName("custom")
            else signingConfigs.getByName("debug")
        }
        debug {
            if (customKeystore != null) signingConfig = signingConfigs.getByName("custom")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        viewBinding = true
    }

    // Świadomie targetSdk 28 (jak MacroDroid Helper) – nie publikujemy na Play.
    lint {
        disable += "ExpiredTargetSdkVersion"
        checkReleaseBuilds = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
}
