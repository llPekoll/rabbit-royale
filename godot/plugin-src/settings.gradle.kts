pluginManagement {
	repositories {
		google()
		mavenCentral()
		gradlePluginPortal()
	}
}

dependencyResolutionManagement {
	repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
	repositories {
		google()
		mavenCentral()
	}
}

rootProject.name = "rabbit-godot-plugins"

// Un module par plugin Godot, chacun produisant son AAR sous
// addons/<Plugin>/bin/. Ils partagent AGP, Kotlin et gradle.properties.
include(":mwa")
include(":firebase")
