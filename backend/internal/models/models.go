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

type ManifestKeberangkatan struct {
	ID                 *string   `json:"id"`
	TripID             *string   `json:"trip_id"`
	PesertaID          *string   `json:"peserta_id"`
	PaymentScheduleID  *string   `json:"payment_schedule_id"`
	TglPemesanan       *string   `json:"tgl_pemesanan"`
	Pemesanan          *string   `json:"pemesanan"`
	Agent              *string   `json:"agent"`
	HargaTiket         *float64  `json:"harga_tiket"`
	KodeBooking        *string   `json:"kode_booking"`
	NoEtiket           *string   `json:"no_etiket"`
	Maskapai           *string   `json:"maskapai"`
	RuteBerangkat      *string   `json:"rute_berangkat"`
	TglBerangkatFlight *string   `json:"tgl_berangkat_flight"`
	JamBerangkat       *string   `json:"jam_berangkat"`
	RutePulang         *string   `json:"rute_pulang"`
	TglPulangFlight    *string   `json:"tgl_pulang_flight"`
	JamPulang          *string   `json:"jam_pulang"`
	BagasiKabinKg      *float64  `json:"bagasi_kabin_kg"`
	BagasiCheckinKg    *float64  `json:"bagasi_checkin_kg"`
	Unit               *int      `json:"unit"`
	Klien              *string   `json:"klien"`
	TiketDriveFileID   *string   `json:"tiket_drive_file_id"`
	LimitPembayaran    *string   `json:"limit_pembayaran"`
	// Joined from manifest_peserta
	Title         *string `json:"title"`
	NamaLengkap   *string `json:"nama_lengkap"`
	NoPaspor      *string `json:"no_paspor"`
	PlaceOfBirth  *string `json:"place_of_birth"`
	TglLahir      *string `json:"tgl_lahir"`
	PlaceOfIssued *string `json:"place_of_issued"`
	IssuedDate    *string `json:"issued_date"`
	ExpiryDate    *string `json:"expiry_date"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type TicketOCRPeserta struct {
	Nama     string `json:"nama"`
	NoEtiket string `json:"no_etiket"`
}

type TicketOCRBookingGroup struct {
	KodeBooking string             `json:"kode_booking"`
	Peserta     []TicketOCRPeserta `json:"peserta"`
}

type TicketOCRResult struct {
	Maskapai        string                  `json:"maskapai"`
	KodeBooking     string                  `json:"kode_booking"`
	RuteBerangkat   string                  `json:"rute_berangkat"`
	TglBerangkat    string                  `json:"tgl_berangkat"`
	JamBerangkat    string                  `json:"jam_berangkat"`
	RutePulang      string                  `json:"rute_pulang"`
	TglPulang       string                  `json:"tgl_pulang"`
	JamPulang       string                  `json:"jam_pulang"`
	BagasiKabinKg   float64                 `json:"bagasi_kabin_kg"`
	BagasiCheckinKg float64                 `json:"bagasi_checkin_kg"`
	BookingGroups   []TicketOCRBookingGroup `json:"booking_groups"`
	Peserta         []TicketOCRPeserta      `json:"peserta"` // legacy fallback
}

type ManifestHotel struct {
	ID                 *string   `json:"id"`
	TripID             *string   `json:"trip_id"`
	Rute               *string   `json:"rute"`
	NamaHotel          *string   `json:"nama_hotel"`
	NamaAgent          *string   `json:"nama_agent"`
	ConfirmationNumber *string   `json:"confirmation_number"`
	TglStayMulai       *string   `json:"tgl_stay_mulai"`
	TglStaySelesai     *string   `json:"tgl_stay_selesai"`
	JumlahRoom         *int      `json:"jumlah_room"`
	TipeRoom           *string   `json:"tipe_room"`
	JumlahMalam        *int      `json:"jumlah_malam"`
	HargaJpy           *float64  `json:"harga_jpy"`
	HargaIdr           *float64  `json:"harga_idr"`
	TotalIdr           *float64  `json:"total_idr"`
	Kurs               *float64  `json:"kurs"`
	PesertaIds         []string  `json:"peserta_ids"`
	PesertaNames       []string  `json:"peserta_names"`
	NotaDriveFileId    *string   `json:"nota_drive_file_id"`
	WaktuPembayaran    *string   `json:"waktu_pembayaran"`
	PaymentScheduleId  *string   `json:"payment_schedule_id"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type HotelOCRResult struct {
	NamaHotel           string   `json:"nama_hotel"`
	ConfirmationNumbers []string `json:"confirmation_numbers"`
	TglCheckin          string   `json:"tgl_checkin"`
	TglCheckout         string   `json:"tgl_checkout"`
	JumlahRoom          int      `json:"jumlah_room"`
	TipeRoom            string   `json:"tipe_room"`
	HargaJpy            float64  `json:"harga_jpy"`
	Kurs                float64  `json:"kurs"`
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
