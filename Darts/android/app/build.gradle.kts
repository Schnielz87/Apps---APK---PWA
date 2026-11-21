plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "de.dartsarena.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "de.dartsarena.app"
        minSdk = 24
        targetSdk = 36
        // Build-Nummer = Laufnummer von .github/workflows/darts.yml -> jede Version ist höher (Update-Funktion)
        val build = (System.getenv("BUILD_NUMBER") ?: "1").toInt()
        versionCode = 100 + build
        versionName = "1.0.$build"
    }

    // github = APK für die Releases (eigene Update-Funktion), play = App-Bundle für Google Play (Updates über Play)
    flavorDimensions += "store"
    productFlavors {
        create("github") { dimension = "store"; buildConfigField("boolean", "PLAY_STORE", "false") }
        create("play") { dimension = "store"; buildConfigField("boolean", "PLAY_STORE", "true") }
    }

    signingConfigs {
        // Fester Signatur-Schlüssel aus GitHub-Secrets -> Updates ohne Neuinstallation
        val ksPath = System.getenv("SIGNING_KEYSTORE_PATH")
        if (!ksPath.isNullOrBlank() && file(ksPath).exists()) {
            create("release") {
                storeFile = file(ksPath)
                storePassword = System.getenv("SIGNING_STORE_PASSWORD")
                keyAlias = System.getenv("SIGNING_KEY_ALIAS")
                keyPassword = System.getenv("SIGNING_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    // Die Oberfläche ist dieselbe wie bei der PWA: Darts/web wird 1:1 als Assets eingepackt
    sourceSets["main"].assets.srcDirs("../../web")

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { buildConfig = true }
}

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("androidx.webkit:webkit:1.12.1")
}
