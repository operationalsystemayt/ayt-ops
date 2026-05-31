package models

import "time"

type Trip struct {
	ID                  string     `json:"id"`
	NamaTrip            string     `json:"nama_trip"`
	RabMasterID         *string    `json:"rab_master_id"`
	TglBerangkat        string     `json:"tgl_berangkat"`
	TglPulang           string     `json:"tgl_pulang"`
	TotalPax            int        `json:"total_pax"`
	Status              string     `json:"status"`
	DriveFolderID       *string    `json:"drive_folder_id"`
	ManifestCsvDriveID  *string    `json:"manifest_csv_drive_id"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

type ManifestPeserta struct {
	ID                 string     `json:"id"`
	TripID             string     `json:"trip_id"`
	NoUrut             int        `json:"no_urut"`
	Title              *string    `json:"title"`
	NamaLengkap        string     `json:"nama_lengkap"`
	NoPaspor           *string    `json:"no_paspor"`
	PlaceOfBirth       *string    `json:"place_of_birth"`
	TglLahir           *string    `json:"tgl_lahir"`
	PlaceOfIssued      *string    `json:"place_of_issued"`
	IssuedDate         *string    `json:"issued_date"`
	ExpiryDate         *string    `json:"expiry_date"`
	RoomType           *string    `json:"room_type"`
	Unit               *int       `json:"unit"`
	Klien              *string    `json:"klien"`
	Meals              *string    `json:"meals"`
	PasporDriveFileID  *string    `json:"paspor_drive_file_id"`
	KtpDriveFileID     *string    `json:"ktp_drive_file_id"`
	VisaDriveFileID    *string    `json:"visa_drive_file_id"`
	VisaStatus         string     `json:"visa_status"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

type TripNote struct {
	ID        string    `json:"id"`
	TripID    string    `json:"trip_id"`
	Content   string    `json:"content"`
	CreatedBy *string   `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type TripPayment struct {
	ID                string    `json:"id"`
	TripID            string    `json:"trip_id"`
	PesertaID         *string   `json:"peserta_id"`
	NamaPeserta       *string   `json:"nama_peserta"`
	Jenis             string    `json:"jenis"`
	Amount            float64   `json:"amount"`
	TglBayar          string    `json:"tgl_bayar"`
	BuktiDriveFileID  *string   `json:"bukti_drive_file_id"`
	Catatan           *string   `json:"catatan"`
	CreatedBy         *string   `json:"created_by"`
	CreatedAt         time.Time `json:"created_at"`
}

type PaymentSchedule struct {
	ID              string     `json:"id"`
	TripID          string     `json:"trip_id"`
	NamaTrip        string     `json:"nama_trip"`
	Jenis           string     `json:"jenis"`
	Deskripsi       *string    `json:"deskripsi"`
	Deadline        string     `json:"deadline"`
	Amount          *float64   `json:"amount"`
	Status          string     `json:"status"`
	DaysUntil       int        `json:"days_until"`
}

type LabaResult struct {
	TripID              string  `json:"trip_id"`
	TotalPemasukan      float64 `json:"total_pemasukan"`
	PengeluaranTiket    float64 `json:"pengeluaran_tiket"`
	PengeluaranHotel    float64 `json:"pengeluaran_hotel"`
	PengeluaranTransport float64 `json:"pengeluaran_transport"`
	PengeluaranOptional float64 `json:"pengeluaran_optional"`
	PengeluaranLainnya  float64 `json:"pengeluaran_lainnya"`
	TotalPengeluaran    float64 `json:"total_pengeluaran"`
	LabaAktual          float64 `json:"laba_aktual"`
	LabaPerPax          float64 `json:"laba_per_pax"`
}
