package com.app.mapmysteps

import android.Manifest
import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.widget.Toast
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.*

class LocationService : Service() {

    companion object {
        const val ACTION_START_FOREGROUND_SERVICE = "com.app.mapmysteps.ACTION_START_FOREGROUND_SERVICE"
        const val ACTION_STOP_FOREGROUND_SERVICE = "com.app.mapmysteps.ACTION_STOP_FOREGROUND_SERVICE"

        private const val TAG = "LocationService"
        private const val CHANNEL_ID = "LocationServiceChannel"
        private const val NOTIFICATION_ID = 123
        private const val MIN_DISTANCE_METERS = 3000
    }

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private lateinit var locationRequest: LocationRequest
    private val firestore = FirebaseFirestore.getInstance()

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        createLocationRequest()
        createLocationCallback()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_FOREGROUND_SERVICE -> {
                val notification = createNotification()
                startForeground(NOTIFICATION_ID, notification)
                requestLocationUpdates()
                Toast.makeText(this, "Location Tracking Started!", Toast.LENGTH_SHORT).show()
            }

            ACTION_STOP_FOREGROUND_SERVICE -> {
                stopForegroundService()
            }

            else -> {
                stopSelf()
            }
        }
        return START_STICKY
    }

    private fun stopForegroundService() {
        stopLocationUpdates()
        stopForeground(true)
        stopSelf()
        Toast.makeText(this, "Location Tracking Stopped.", Toast.LENGTH_SHORT).show()
    }

    override fun onDestroy() {
        super.onDestroy()
        stopLocationUpdates()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createLocationRequest() {
        locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000L)
            .setMinUpdateIntervalMillis(2000L)
            .build()
    }

    private fun createLocationCallback() {
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                val location = locationResult.lastLocation ?: return
                val latitude = location.latitude
                val longitude = location.longitude
                val timestamp = System.currentTimeMillis()
                val dateKey = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
                val user = FirebaseAuth.getInstance().currentUser ?: return
                val userId = user.uid
                val locationDocRef = firestore.collection("locations").document(userId).collection(dateKey)

                locationDocRef.orderBy("timestamp", com.google.firebase.firestore.Query.Direction.DESCENDING)
                    .limit(1)
                    .get()
                    .addOnSuccessListener { docs ->
                        val last = docs.documents.firstOrNull()
                        if (last != null) {
                            val lastLat = last.getDouble("latitude") ?: 0.0
                            val lastLng = last.getDouble("longitude") ?: 0.0
                            val distance = haversine(latitude, longitude, lastLat, lastLng)
                            if (distance < MIN_DISTANCE_METERS) {
                                Log.d(TAG, "Location too close to last: ${distance}m — not saving")
                                return@addOnSuccessListener
                            }
                        }

                        val entryId = UUID.randomUUID().toString()
                        val locationData = mapOf(
                            "latitude" to latitude,
                            "longitude" to longitude,
                            "timestamp" to timestamp,
                            "speed" to location.speed,
                            "accuracy" to location.accuracy
                        )
                        locationDocRef.document(entryId).set(locationData)
                            .addOnSuccessListener { Log.d(TAG, "Location saved") }
                            .addOnFailureListener { e -> Log.e(TAG, "Failed to save location", e) }
                    }
                    .addOnFailureListener { e -> Log.e(TAG, "Failed to fetch last location", e) }
            }
        }
    }

    private fun requestLocationUpdates() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
        ) {
            Log.e(TAG, "Location permissions not granted.")
            stopSelf()
            return
        }
        fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, Looper.getMainLooper())
            .addOnSuccessListener { Log.d(TAG, "Location updates started") }
            .addOnFailureListener { e -> Log.e(TAG, "Failed to request updates", e); stopSelf() }
    }

    private fun stopLocationUpdates() {
        if (::fusedLocationClient.isInitialized && ::locationCallback.isInitialized) {
            fusedLocationClient.removeLocationUpdates(locationCallback)
                .addOnSuccessListener { Log.d(TAG, "Location updates stopped") }
                .addOnFailureListener { e -> Log.e(TAG, "Failed to stop updates", e) }
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Location Tracking"
            val descriptionText = "Tracks your location in the background."
            val importance = NotificationManager.IMPORTANCE_LOW
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val stopIntent = Intent(this, LocationService::class.java).apply {
            action = ACTION_STOP_FOREGROUND_SERVICE
        }

        val stopPendingIntent = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val mainIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }

        val mainPendingIntent = PendingIntent.getActivity(
            this, 0, mainIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MapMySteps: Tracking Location")
            .setContentText("Your location is being recorded in the background.")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(mainPendingIntent)
            .addAction(R.drawable.ic_stop, "Stop", stopPendingIntent) // You must have this icon
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    private fun haversine(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val R = 6371000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2).pow(2.0) + cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2.0)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return R * c
    }
}
