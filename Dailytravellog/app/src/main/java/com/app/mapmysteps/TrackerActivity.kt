package com.app.mapmysteps

import android.Manifest
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import androidx.annotation.RequiresApi
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider

class TrackerActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "TrackerActivity"
        private const val LOCATION_PERMISSION_REQUEST_CODE = 1001
        private const val NOTIFICATION_PERMISSION_REQUEST_CODE = 2001
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        FirebaseApp.initializeApp(this)

        // Notification permission (Android 13+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            checkAndRequestNotificationPermission()
        }

        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent?.action == Intent.ACTION_VIEW) {
            val data = intent.data
            val token = data?.getQueryParameter("token")
            val msg = data?.getQueryParameter("msg")

            if (!token.isNullOrEmpty()) {
                val credential = GoogleAuthProvider.getCredential(token, null)
                FirebaseAuth.getInstance().signInWithCredential(credential)
                    .addOnCompleteListener { task ->
                        if (task.isSuccessful) {
                            Toast.makeText(this, "Logged in", Toast.LENGTH_SHORT).show()
                            requestLocationPermissions()
                        } else {
                            Toast.makeText(this, "Login failed", Toast.LENGTH_SHORT).show()
                            finish()
                        }
                    }
            }
            if (!msg.isNullOrEmpty()){
                val user = FirebaseAuth.getInstance().currentUser
                if (user != null) {

                    val email = user.email

                    Log.d(TAG, "Logged in as  ($email)")
                    Log.d(TAG, "Logged in as  ($msg)")
                    requestLocationPermissions()

                }
                else {
                    Toast.makeText(this, "Invalid token", Toast.LENGTH_SHORT).show()
                    Log.w(TAG, "⚠️ Token not found in URI")
                    Toast.makeText(this, "Invalid token in URI", Toast.LENGTH_SHORT).show()
                }
            }
        } else {
            Toast.makeText(this, "Unsupported intent", Toast.LENGTH_SHORT).show()
            finish()
        }
    }

    private fun requestLocationPermissions() {
        val permissions = mutableListOf<String>()

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.ACCESS_FINE_LOCATION)
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION)
        }


        if (permissions.isNotEmpty()) {
            showPermissionExplanationDialog(permissions.toTypedArray())
        } else {

                startTrackingService()
            }

    }

    private fun showBackgroundLocationDialog() {
        AlertDialog.Builder(this)
            .setTitle("Background Location Access")
            .setMessage("To track steps in the background, please allow background location access.")
            .setPositiveButton("Allow") { _, _ ->
                ActivityCompat.requestPermissions(
                    this,
                    arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
                    LOCATION_PERMISSION_REQUEST_CODE
                )
            }
            .setNegativeButton("Cancel") { _, _ -> finish() }
            .show()
    }
    private fun showPermissionExplanationDialog(permissions: Array<String>) {
        AlertDialog.Builder(this)
            .setTitle("Location Permission Needed")
            .setMessage("This app needs location access (including background) to track your steps. Please allow 'All the time' location access.")
            .setPositiveButton("Allow") { _, _ ->
                ActivityCompat.requestPermissions(this, permissions, LOCATION_PERMISSION_REQUEST_CODE)
            }
            .setNegativeButton("Cancel") { _, _ ->
                Toast.makeText(this, "Permission denied", Toast.LENGTH_SHORT).show()
                finish()
            }
            .show()
    }

    private fun startTrackingService() {
        val intent = Intent(this, LocationService::class.java).apply {
            action = LocationService.ACTION_START_FOREGROUND_SERVICE
        }
        ContextCompat.startForegroundService(this, intent)
        showStopTrackingDialog()
    }

    private fun showStopTrackingDialog() {
        AlertDialog.Builder(this)
            .setTitle("Tracking Started")
            .setMessage("Your steps are being tracked. Do you want to stop tracking?")
            .setPositiveButton("Stop Tracking") { _, _ ->
                stopTrackingService()
            }
            .setNegativeButton("Continue") { _, _ -> finish() }
            .show()
    }

    private fun stopTrackingService() {
        val intent = Intent(this, LocationService::class.java).apply {
            action = LocationService.ACTION_STOP_FOREGROUND_SERVICE
        }
        startService(intent)
        Toast.makeText(this, "Tracking stopped", Toast.LENGTH_SHORT).show()
        finish()
    }

    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    private fun checkAndRequestNotificationPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                NOTIFICATION_PERMISSION_REQUEST_CODE
            )
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        if (requestCode == LOCATION_PERMISSION_REQUEST_CODE) {
            var allGranted = true
            for (result in grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false
                    break
                }
            }

            if (allGranted) {
                startTrackingService()
            } else {
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.fromParts("package", packageName, null)
                }
                Toast.makeText(this, "Enable location permissions manually in settings", Toast.LENGTH_LONG).show()
                startActivity(intent)
            }
        }
    }
}
