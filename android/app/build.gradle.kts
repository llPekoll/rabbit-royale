plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.gms.google-services")
}

android {
    namespace = "fun.rabbitroyale.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "fun.rabbitroyale.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "0.1"

        // L'URL du jeu vit ici, pas en dur dans le code : un build de test
        // pointe sur une machine locale sans toucher au source.
        buildConfigField(
            "String",
            "GAME_URL",
            "\"${System.getenv("RR_GAME_URL") ?: "https://kpj80wphpilv7dzarcbyn4qi.datemeee.com"}\"",
        )
    }

    signingConfigs {
        create("release") {
            // Keystore et mots de passe passés par variables d'environnement —
            // jamais en dur dans le repo.
            val ksPath = System.getenv("RR_KEYSTORE")
            if (ksPath != null) {
                storeFile = file(ksPath)
                storePassword = System.getenv("RR_KS_PASS")
                keyAlias = System.getenv("RR_KEY_ALIAS") ?: "android"
                keyPassword = System.getenv("RR_KEY_PASS") ?: System.getenv("RR_KS_PASS")
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            // release si le keystore est fourni, sinon debug (build de test)
            signingConfig = if (System.getenv("RR_KEYSTORE") != null)
                signingConfigs.getByName("release")
            else signingConfigs.getByName("debug")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    sourceSets["main"].java.srcDirs("src/main/kotlin")
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    // Firebase Cloud Messaging — les notifs natives (raid subi, terrier
    // réparé, saison qui se termine) sont ce qui ramène le joueur, donc elles
    // doivent arriver app fermée : hors WebView, forcément.
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-messaging-ktx")
    // Mobile Wallet Adapter — parle au Seed Vault du Seeker (et à tout wallet
    // MWA) pour signer le challenge de login sans jamais exposer la clé.
    implementation("com.solanamobile:mobile-wallet-adapter-clientlib-ktx:2.0.8")
    implementation("io.github.funkatronics:multimult:0.2.6")
}
