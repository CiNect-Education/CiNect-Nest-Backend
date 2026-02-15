import { PrismaClient, UserRole, MovieStatus, AgeRating, RoomFormat, SeatType, SeatStatus, PromotionStatus, DiscountType, NewsCategory, GiftCardStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // ============ ROLES ============
  console.log('Creating roles...');
  const adminRole = await prisma.role.upsert({
    where: { name: UserRole.ADMIN },
    update: {},
    create: { name: UserRole.ADMIN, permissions: ['*'] as object },
  });
  const staffRole = await prisma.role.upsert({
    where: { name: UserRole.STAFF },
    update: {},
    create: { name: UserRole.STAFF, permissions: ['movies:read', 'bookings:read', 'showtimes:manage'] as object },
  });
  const userRole = await prisma.role.upsert({
    where: { name: UserRole.USER },
    update: {},
    create: { name: UserRole.USER, permissions: [] as object },
  });

  // ============ MEMBERSHIP TIERS ============
  console.log('Creating membership tiers...');
  const tiersData = [
    { name: 'Bronze', level: 1, pointsRequired: 0, benefits: ['Welcome bonus 50 points', 'Birthday voucher'], discountPercent: 0, color: '#CD7F32' },
    { name: 'Silver', level: 2, pointsRequired: 1000, benefits: ['5% discount on tickets', 'Free size upgrade on combo', 'Birthday voucher'], discountPercent: 5, color: '#C0C0C0' },
    { name: 'Gold', level: 3, pointsRequired: 5000, benefits: ['10% discount on tickets', 'Priority booking', 'Free combo monthly', 'Birthday voucher'], discountPercent: 10, color: '#FFD700' },
    { name: 'Platinum', level: 4, pointsRequired: 15000, benefits: ['15% discount on tickets', 'VIP lounge access', 'Free combo weekly', 'Birthday voucher', 'Exclusive screenings'], discountPercent: 15, color: '#E5E4E2' },
  ];
  for (const t of tiersData) {
    await prisma.membershipTier.upsert({
      where: { name: t.name },
      update: {},
      create: { ...t, benefits: t.benefits as object },
    });
  }

  // ============ USERS ============
  console.log('Creating users...');
  const hashedPassword = await bcrypt.hash('Password@123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@cinect.vn' },
    update: {},
    create: {
      email: 'admin@cinect.vn',
      passwordHash: hashedPassword,
      fullName: 'Admin CiNect',
      phone: '0901234567',
      isActive: true,
      emailVerified: true,
      city: 'Ho Chi Minh',
    },
  });
  await prisma.userRoleJoin.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: adminRole.id },
  });

  const demoUser = await prisma.user.upsert({
    where: { email: 'user@cinect.vn' },
    update: {},
    create: {
      email: 'user@cinect.vn',
      passwordHash: hashedPassword,
      fullName: 'Nguyen Van A',
      phone: '0912345678',
      isActive: true,
      emailVerified: true,
      city: 'Ho Chi Minh',
    },
  });
  await prisma.userRoleJoin.upsert({
    where: { userId_roleId: { userId: demoUser.id, roleId: userRole.id } },
    update: {},
    create: { userId: demoUser.id, roleId: userRole.id },
  });

  // ============ GENRES ============
  console.log('Creating genres...');
  const genresData = [
    { name: 'Action', slug: 'action' },
    { name: 'Comedy', slug: 'comedy' },
    { name: 'Drama', slug: 'drama' },
    { name: 'Horror', slug: 'horror' },
    { name: 'Sci-Fi', slug: 'sci-fi' },
    { name: 'Romance', slug: 'romance' },
    { name: 'Animation', slug: 'animation' },
    { name: 'Thriller', slug: 'thriller' },
    { name: 'Fantasy', slug: 'fantasy' },
    { name: 'Adventure', slug: 'adventure' },
  ];
  const genres: Record<string, string> = {};
  for (const g of genresData) {
    const genre = await prisma.genre.upsert({
      where: { slug: g.slug },
      update: {},
      create: g,
    });
    genres[g.slug] = genre.id;
  }

  // ============ MOVIES ============
  console.log('Creating movies...');
  const moviesData = [
    {
      title: 'Avengers: Secret Wars',
      originalTitle: 'Avengers: Secret Wars',
      slug: 'avengers-secret-wars',
      description: 'The Avengers face their greatest threat yet as the multiverse collides in an epic battle that will determine the fate of all realities. Heroes from across dimensions must unite against an enemy that threatens to destroy everything.',
      posterUrl: 'https://placehold.co/400x600/1a1a2e/e94560?text=Avengers',
      bannerUrl: 'https://placehold.co/1200x400/1a1a2e/e94560?text=Avengers+Secret+Wars',
      trailerUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      duration: 165,
      releaseDate: new Date('2026-01-15'),
      director: 'The Russo Brothers',
      castMembers: ['Robert Downey Jr.', 'Chris Evans', 'Scarlett Johansson', 'Tom Holland'] as object,
      language: 'English',
      subtitles: 'Vietnamese',
      rating: 8.5,
      ratingCount: 1250,
      ageRating: AgeRating.C13,
      formats: ['2D', '3D', 'IMAX'] as object,
      status: MovieStatus.NOW_SHOWING,
      genreSlugs: ['action', 'sci-fi', 'adventure'],
    },
    {
      title: 'Lật Mặt 8: Hồi Kết',
      originalTitle: 'Face Off 8: The Finale',
      slug: 'lat-mat-8-hoi-ket',
      description: 'Phần cuối cùng của loạt phim Lật Mặt đình đám. Mọi bí mật sẽ được hé lộ trong cuộc chiến cuối cùng giữa thiện và ác, nơi ranh giới giữa đúng và sai trở nên mờ nhạt.',
      posterUrl: 'https://placehold.co/400x600/2d3436/00b894?text=Lat+Mat+8',
      bannerUrl: 'https://placehold.co/1200x400/2d3436/00b894?text=Lat+Mat+8',
      duration: 135,
      releaseDate: new Date('2026-02-01'),
      director: 'Ly Hai',
      castMembers: ['Ly Hai', 'Truong Giang', 'Oc Thanh Van', 'Huy Khanh'] as object,
      language: 'Vietnamese',
      rating: 7.8,
      ratingCount: 3400,
      ageRating: AgeRating.C16,
      formats: ['2D'] as object,
      status: MovieStatus.NOW_SHOWING,
      genreSlugs: ['action', 'thriller', 'drama'],
    },
    {
      title: 'Inside Out 3',
      originalTitle: 'Inside Out 3',
      slug: 'inside-out-3',
      description: 'Riley is now in college and faces a whole new set of emotions. Watch as Anxiety, Nostalgia, and Ambition join the team inside headquarters, creating hilarious and heartwarming adventures.',
      posterUrl: 'https://placehold.co/400x600/6c5ce7/ffeaa7?text=Inside+Out+3',
      bannerUrl: 'https://placehold.co/1200x400/6c5ce7/ffeaa7?text=Inside+Out+3',
      duration: 105,
      releaseDate: new Date('2026-02-10'),
      director: 'Kelsey Mann',
      castMembers: ['Amy Poehler', 'Maya Hawke', 'Ayo Edebiri', 'Lewis Black'] as object,
      language: 'English',
      subtitles: 'Vietnamese',
      rating: 8.2,
      ratingCount: 2100,
      ageRating: AgeRating.P,
      formats: ['2D', '3D'] as object,
      status: MovieStatus.NOW_SHOWING,
      genreSlugs: ['animation', 'comedy', 'drama'],
    },
    {
      title: 'Dune: Part Three',
      originalTitle: 'Dune: Part Three',
      slug: 'dune-part-three',
      description: 'The epic conclusion to the Dune saga. Paul Atreides faces the consequences of his choices as the fate of the universe hangs in the balance. An explosive finale filled with breathtaking visuals.',
      posterUrl: 'https://placehold.co/400x600/d63031/dfe6e9?text=Dune+3',
      bannerUrl: 'https://placehold.co/1200x400/d63031/dfe6e9?text=Dune+Part+Three',
      duration: 175,
      releaseDate: new Date('2026-03-20'),
      director: 'Denis Villeneuve',
      castMembers: ['Timothée Chalamet', 'Zendaya', 'Florence Pugh', 'Austin Butler'] as object,
      language: 'English',
      subtitles: 'Vietnamese',
      rating: 9.0,
      ratingCount: 500,
      ageRating: AgeRating.C13,
      formats: ['2D', 'IMAX'] as object,
      status: MovieStatus.COMING_SOON,
      genreSlugs: ['sci-fi', 'adventure', 'drama'],
    },
    {
      title: 'Mai 2',
      originalTitle: 'Mai 2',
      slug: 'mai-2',
      description: 'Phần tiếp theo của bộ phim Mai đình đám. Câu chuyện tình yêu đầy cảm xúc tiếp tục với những bất ngờ mới, khi Mai phải đối mặt với quá khứ và tìm lại chính mình.',
      posterUrl: 'https://placehold.co/400x600/e17055/fab1a0?text=Mai+2',
      bannerUrl: 'https://placehold.co/1200x400/e17055/fab1a0?text=Mai+2',
      duration: 125,
      releaseDate: new Date('2026-04-10'),
      director: 'Tran Thanh',
      castMembers: ['Phuong Anh Dao', 'Tuan Tran', 'NSUT Viet Huong', 'Ngoc Giau'] as object,
      language: 'Vietnamese',
      rating: 0,
      ratingCount: 0,
      ageRating: AgeRating.C16,
      formats: ['2D'] as object,
      status: MovieStatus.COMING_SOON,
      genreSlugs: ['romance', 'drama'],
    },
    {
      title: 'The Batman 2',
      originalTitle: 'The Batman Part II',
      slug: 'the-batman-2',
      description: 'Bruce Wayne continues his journey as Gotham\'s protector, facing new villains that threaten to tear the city apart. A dark, gripping sequel that pushes the boundaries of superhero storytelling.',
      posterUrl: 'https://placehold.co/400x600/2c3e50/ecf0f1?text=Batman+2',
      bannerUrl: 'https://placehold.co/1200x400/2c3e50/ecf0f1?text=The+Batman+2',
      duration: 155,
      releaseDate: new Date('2026-02-05'),
      director: 'Matt Reeves',
      castMembers: ['Robert Pattinson', 'Zoë Kravitz', 'Colin Farrell', 'Jeffrey Wright'] as object,
      language: 'English',
      subtitles: 'Vietnamese',
      rating: 8.7,
      ratingCount: 1800,
      ageRating: AgeRating.C16,
      formats: ['2D', 'IMAX', '4DX'] as object,
      status: MovieStatus.NOW_SHOWING,
      genreSlugs: ['action', 'thriller'],
    },
  ];

  const movieIds: Record<string, string> = {};
  for (const m of moviesData) {
    const { genreSlugs, ...movieData } = m;
    const movie = await prisma.movie.upsert({
      where: { slug: m.slug },
      update: {},
      create: movieData,
    });
    movieIds[m.slug] = movie.id;

    for (const slug of genreSlugs) {
      if (genres[slug]) {
        await prisma.movieGenre.upsert({
          where: { movieId_genreId: { movieId: movie.id, genreId: genres[slug] } },
          update: {},
          create: { movieId: movie.id, genreId: genres[slug] },
        });
      }
    }
  }

  // ============ CINEMAS ============
  console.log('Creating cinemas...');
  const cinemasData = [
    {
      name: 'CiNect Landmark 81',
      slug: 'cinect-landmark-81',
      address: 'Tầng 3, Landmark 81, 720A Điện Biên Phủ, Phường 22',
      city: 'Ho Chi Minh',
      district: 'Binh Thanh',
      phone: '028 7108 8881',
      email: 'landmark81@cinect.vn',
      imageUrl: 'https://placehold.co/800x400/0984e3/dfe6e9?text=CiNect+Landmark+81',
      amenities: ['IMAX', '4DX', 'Dolby Atmos', 'VIP Lounge', 'Parking', 'F&B Court'] as object,
      latitude: 10.7950,
      longitude: 106.7220,
    },
    {
      name: 'CiNect Vincom Center',
      slug: 'cinect-vincom-center',
      address: 'Tầng 5, Vincom Center, 72 Lê Thánh Tôn, Phường Bến Nghé',
      city: 'Ho Chi Minh',
      district: 'District 1',
      phone: '028 3827 8888',
      email: 'vincom@cinect.vn',
      imageUrl: 'https://placehold.co/800x400/00b894/dfe6e9?text=CiNect+Vincom',
      amenities: ['3D', 'Dolby Atmos', 'Couple Seats', 'Cafe', 'Parking'] as object,
      latitude: 10.7769,
      longitude: 106.7009,
    },
    {
      name: 'CiNect Royal City',
      slug: 'cinect-royal-city',
      address: 'Tầng 4, Royal City, 72A Nguyễn Trãi, Phường Thượng Đình',
      city: 'Ha Noi',
      district: 'Thanh Xuan',
      phone: '024 6262 8888',
      email: 'royalcity@cinect.vn',
      imageUrl: 'https://placehold.co/800x400/e17055/dfe6e9?text=CiNect+Royal+City',
      amenities: ['IMAX', '3D', 'VIP Lounge', 'Parking', 'Kids Zone'] as object,
      latitude: 21.0018,
      longitude: 105.8156,
    },
  ];

  const cinemaIds: Record<string, string> = {};
  for (const c of cinemasData) {
    const cinema = await prisma.cinema.upsert({
      where: { slug: c.slug },
      update: {},
      create: c,
    });
    cinemaIds[c.slug] = cinema.id;
  }

  // ============ ROOMS & SEATS ============
  console.log('Creating rooms and seats...');
  const roomsData = [
    { cinemaSlug: 'cinect-landmark-81', name: 'Screen 1 - IMAX', format: RoomFormat.IMAX, rows: 10, columns: 16 },
    { cinemaSlug: 'cinect-landmark-81', name: 'Screen 2 - Standard', format: RoomFormat.STANDARD2D, rows: 8, columns: 12 },
    { cinemaSlug: 'cinect-landmark-81', name: 'Screen 3 - 4DX', format: RoomFormat.FOURDX, rows: 6, columns: 10 },
    { cinemaSlug: 'cinect-vincom-center', name: 'Screen 1 - Dolby', format: RoomFormat.DOLBY, rows: 8, columns: 14 },
    { cinemaSlug: 'cinect-vincom-center', name: 'Screen 2 - Standard', format: RoomFormat.STANDARD2D, rows: 8, columns: 12 },
    { cinemaSlug: 'cinect-royal-city', name: 'Screen 1 - IMAX', format: RoomFormat.IMAX, rows: 10, columns: 16 },
    { cinemaSlug: 'cinect-royal-city', name: 'Screen 2 - Standard', format: RoomFormat.STANDARD2D, rows: 8, columns: 12 },
  ];

  const roomIds: string[] = [];
  const roomCinemaMap: Record<string, string> = {};
  for (const r of roomsData) {
    const cinemaId = cinemaIds[r.cinemaSlug];
    const totalSeats = r.rows * r.columns;

    const existing = await prisma.room.findUnique({
      where: { cinemaId_name: { cinemaId, name: r.name } },
    });

    let room;
    if (existing) {
      room = existing;
    } else {
      room = await prisma.room.create({
        data: {
          cinemaId,
          name: r.name,
          format: r.format,
          totalSeats,
          rows: r.rows,
          columns: r.columns,
        },
      });

      // Create seats
      const rowLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const seats = [];
      for (let row = 0; row < r.rows; row++) {
        for (let col = 1; col <= r.columns; col++) {
          let seatType: SeatType = SeatType.STANDARD;
          let price = 85000;

          // Last 2 rows are VIP
          if (row >= r.rows - 2) {
            seatType = SeatType.VIP;
            price = 120000;
          }
          // First row: wheelchair accessible at edges
          if (row === 0 && (col === 1 || col === r.columns)) {
            seatType = SeatType.DISABLED;
            price = 70000;
          }

          seats.push({
            roomId: room.id,
            rowLabel: rowLabels[row],
            number: col,
            type: seatType,
            status: SeatStatus.AVAILABLE,
            isAisle: false,
            price,
          });
        }
      }
      await prisma.seat.createMany({ data: seats });
    }
    roomIds.push(room.id);
    roomCinemaMap[room.id] = cinemaId;
  }

  // ============ SHOWTIMES ============
  console.log('Creating showtimes...');
  const today = new Date();
  const nowShowingMovies = Object.entries(movieIds).filter(([slug]) =>
    ['avengers-secret-wars', 'lat-mat-8-hoi-ket', 'inside-out-3', 'the-batman-2'].includes(slug)
  );

  for (const [movieSlug, movieId] of nowShowingMovies) {
    for (let roomIdx = 0; roomIdx < roomIds.length; roomIdx++) {
      const roomId = roomIds[roomIdx];
      const cinemaId = roomCinemaMap[roomId];

      // Create showtimes for today and next 5 days
      for (let dayOffset = 0; dayOffset <= 5; dayOffset++) {
        const times = [
          { hour: 10, min: 0 },
          { hour: 13, min: 30 },
          { hour: 16, min: 0 },
          { hour: 19, min: 30 },
          { hour: 22, min: 0 },
        ];

        // Each movie gets different time slots per room to avoid overlap
        const movieIndex = nowShowingMovies.findIndex(([s]) => s === movieSlug);
        const timeSlot = times[(movieIndex + roomIdx) % times.length];

        const startTime = new Date(today);
        startTime.setDate(startTime.getDate() + dayOffset);
        startTime.setHours(timeSlot.hour, timeSlot.min, 0, 0);

        const movieDuration = moviesData.find(m => m.slug === movieSlug)?.duration || 120;
        const endTime = new Date(startTime.getTime() + movieDuration * 60 * 1000);

        // Only create if in the future
        if (startTime > today) {
          const existingShowtime = await prisma.showtime.findFirst({
            where: {
              movieId,
              roomId,
              startTime,
            },
          });

          if (!existingShowtime) {
            await prisma.showtime.create({
              data: {
                movieId,
                roomId,
                cinemaId,
                startTime,
                endTime,
                basePrice: 85000,
                format: RoomFormat.STANDARD2D,
                language: movieSlug.includes('lat-mat') || movieSlug.includes('mai') ? 'Vietnamese' : 'English',
                subtitles: movieSlug.includes('lat-mat') || movieSlug.includes('mai') ? undefined : 'Vietnamese',
              },
            });
          }
        }
      }
    }
  }

  // ============ PROMOTIONS ============
  console.log('Creating promotions...');
  const promotionsData = [
    {
      title: 'Student Discount - 20% Off',
      description: 'Show your student ID and get 20% off on all weekday screenings. Valid for all formats and movies.',
      code: 'STUDENT20',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 20,
      minPurchase: 0,
      maxDiscount: 50000,
      usageLimit: 1000,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-06-30'),
      imageUrl: 'https://placehold.co/600x300/0984e3/ffffff?text=Student+20%25+Off',
      conditions: 'Valid student ID required. Weekdays only.',
      status: PromotionStatus.ACTIVE,
      isTrending: true,
    },
    {
      title: 'Combo Deal - Buy 2 Get 1 Free',
      description: 'Purchase 2 movie tickets and get a free combo snack pack. Perfect for date nights!',
      code: 'COMBO2026',
      discountType: DiscountType.FIXED,
      discountValue: 50000,
      minPurchase: 150000,
      maxDiscount: 50000,
      usageLimit: 500,
      startDate: new Date('2026-02-01'),
      endDate: new Date('2026-03-31'),
      imageUrl: 'https://placehold.co/600x300/e17055/ffffff?text=Combo+Deal',
      conditions: 'Minimum 2 tickets per transaction.',
      status: PromotionStatus.ACTIVE,
      isTrending: true,
    },
    {
      title: 'Valentine Special - 30% Off Couple Seats',
      description: 'Celebrate love with 30% discount on all couple seats throughout February.',
      code: 'LOVE2026',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 30,
      minPurchase: 200000,
      maxDiscount: 100000,
      usageLimit: 200,
      startDate: new Date('2026-02-01'),
      endDate: new Date('2026-02-28'),
      imageUrl: 'https://placehold.co/600x300/e84393/ffffff?text=Valentine+30%25+Off',
      conditions: 'Couple seats only. Limited availability.',
      status: PromotionStatus.ACTIVE,
      isTrending: true,
    },
    {
      title: 'Weekend Family Pack',
      description: 'Get 15% off when buying 4 or more tickets on weekends. Bring the whole family!',
      code: 'FAMILY15',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 15,
      minPurchase: 300000,
      maxDiscount: 150000,
      usageLimit: 300,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      imageUrl: 'https://placehold.co/600x300/00b894/ffffff?text=Family+Pack',
      conditions: 'Minimum 4 tickets. Weekends only.',
      status: PromotionStatus.ACTIVE,
      isTrending: false,
    },
  ];

  for (const p of promotionsData) {
    await prisma.promotion.upsert({
      where: { code: p.code! },
      update: {},
      create: p,
    });
  }

  // ============ NEWS ARTICLES ============
  console.log('Creating news articles...');
  const newsData = [
    {
      title: 'Avengers: Secret Wars Breaks Opening Weekend Records',
      slug: 'avengers-secret-wars-breaks-records',
      excerpt: 'The latest Marvel blockbuster shattered box office records with a stunning $400M opening weekend in Vietnam.',
      content: 'Avengers: Secret Wars has officially become the biggest opening weekend in Vietnamese cinema history. The film, directed by the Russo Brothers, brought together heroes from across the multiverse in an epic battle that had audiences cheering. CiNect cinemas reported sold-out screenings across all locations, with IMAX and 4DX formats being the most popular. The film is expected to continue its strong run through February.',
      category: NewsCategory.GENERAL,
      imageUrl: 'https://placehold.co/800x400/1a1a2e/e94560?text=Box+Office+Record',
      author: 'CiNect Editorial',
      tags: ['box office', 'marvel', 'avengers'] as object,
    },
    {
      title: 'CiNect Launches Premium IMAX Experience at Landmark 81',
      slug: 'cinect-imax-landmark-81',
      excerpt: 'Experience movies like never before with our new state-of-the-art IMAX screen at Landmark 81.',
      content: 'We are thrilled to announce the opening of our premium IMAX theater at CiNect Landmark 81. Featuring the latest IMAX with Laser technology, a 25-meter screen, and 12-channel sound system, this is the ultimate movie-watching experience in Ho Chi Minh City. Grand opening screenings include Avengers: Secret Wars and Dune: Part Three. Members get early access to bookings.',
      category: NewsCategory.GENERAL,
      imageUrl: 'https://placehold.co/800x400/0984e3/ffffff?text=IMAX+Launch',
      author: 'CiNect PR Team',
      tags: ['IMAX', 'landmark 81', 'premium'] as object,
    },
    {
      title: 'Review: Inside Out 3 - A Heartwarming College Adventure',
      slug: 'review-inside-out-3',
      excerpt: 'Pixar delivers another emotional masterpiece with Inside Out 3, exploring the challenges of college life.',
      content: 'Inside Out 3 takes Riley to college, introducing new emotions like Anxiety, Nostalgia, and Ambition. The film brilliantly captures the universal experience of leaving home for the first time. With stunning animation and a touching story, this is Pixar at its finest. We give it 4.5 out of 5 stars. A must-watch for the whole family.',
      category: NewsCategory.REVIEWS,
      imageUrl: 'https://placehold.co/800x400/6c5ce7/ffeaa7?text=Inside+Out+3+Review',
      author: 'Movie Reviewer',
      tags: ['review', 'pixar', 'animation'] as object,
    },
    {
      title: 'Coming Soon: Dune Part Three - Everything You Need to Know',
      slug: 'dune-part-three-preview',
      excerpt: 'The epic conclusion to the Dune trilogy arrives March 2026. Here\'s what to expect.',
      content: 'Denis Villeneuve returns to complete his ambitious adaptation of Frank Herbert\'s sci-fi masterpiece. Dune: Part Three promises to be the most visually spectacular film of the year, with the story concluding Paul Atreides\' journey. Expect breathtaking desert sequences, political intrigue, and an unforgettable finale. Pre-booking opens February 28 exclusively for CiNect members.',
      category: NewsCategory.TRAILERS,
      imageUrl: 'https://placehold.co/800x400/d63031/dfe6e9?text=Dune+Preview',
      author: 'CiNect Editorial',
      tags: ['dune', 'preview', 'sci-fi'] as object,
    },
    {
      title: 'How to Get the Best Seats at CiNect - A Complete Guide',
      slug: 'guide-best-seats-cinect',
      excerpt: 'Tips and tricks for choosing the perfect seats for your next movie experience.',
      content: 'Finding the perfect seat can make or break your movie experience. For IMAX: sit in the center, about 2/3 back. For standard screens: the center rows offer the best viewing angle. VIP seats offer extra legroom and service. Couple seats are perfect for date nights with added privacy. Pro tip: Book early through the CiNect app to get the best selection, and use the seat map to find your ideal spot.',
      category: NewsCategory.GUIDES,
      imageUrl: 'https://placehold.co/800x400/00b894/ffffff?text=Seat+Guide',
      author: 'CiNect Team',
      tags: ['guide', 'tips', 'seats'] as object,
    },
  ];

  for (const n of newsData) {
    await prisma.newsArticle.upsert({
      where: { slug: n.slug },
      update: {},
      create: n,
    });
  }

  // ============ SNACKS ============
  console.log('Creating snacks...');
  const snacksData = [
    { name: 'Popcorn (L)', description: 'Large butter popcorn', price: 55000, imageUrl: 'https://placehold.co/200x200/f9ca24/2d3436?text=Popcorn+L' },
    { name: 'Popcorn (M)', description: 'Medium butter popcorn', price: 40000, imageUrl: 'https://placehold.co/200x200/f9ca24/2d3436?text=Popcorn+M' },
    { name: 'Coca-Cola (L)', description: 'Large Coca-Cola', price: 35000, imageUrl: 'https://placehold.co/200x200/e74c3c/ffffff?text=Coca+Cola' },
    { name: 'Combo Couple', description: '2 Popcorn L + 2 Coca-Cola L', price: 150000, imageUrl: 'https://placehold.co/200x200/e84393/ffffff?text=Combo+Couple' },
    { name: 'Combo Family', description: '2 Popcorn L + 4 Drinks', price: 220000, imageUrl: 'https://placehold.co/200x200/00b894/ffffff?text=Combo+Family' },
    { name: 'Nachos', description: 'Nachos with cheese sauce', price: 60000, imageUrl: 'https://placehold.co/200x200/fdcb6e/2d3436?text=Nachos' },
    { name: 'Hot Dog', description: 'Classic hot dog', price: 45000, imageUrl: 'https://placehold.co/200x200/e17055/ffffff?text=Hot+Dog' },
    { name: 'Water Bottle', description: 'Mineral water 500ml', price: 15000, imageUrl: 'https://placehold.co/200x200/74b9ff/2d3436?text=Water' },
  ];

  for (const cinemaSlug of Object.keys(cinemaIds)) {
    for (const s of snacksData) {
      const existing = await prisma.snack.findFirst({
        where: { cinemaId: cinemaIds[cinemaSlug], name: s.name },
      });
      if (!existing) {
        await prisma.snack.create({
          data: { ...s, cinemaId: cinemaIds[cinemaSlug] },
        });
      }
    }
  }

  // ============ GIFT CARDS ============
  console.log('Creating gift cards...');
  const giftCardsData = [
    { title: 'Movie Night Gift Card', description: 'Perfect gift for movie lovers. Covers 1 standard ticket.', value: 100000, price: 90000, status: GiftCardStatus.AVAILABLE, imageUrl: 'https://placehold.co/400x250/6c5ce7/ffffff?text=100K+Gift+Card' },
    { title: 'Premium Experience Gift Card', description: 'Enjoy a premium movie experience with VIP seats and snacks.', value: 300000, price: 270000, status: GiftCardStatus.AVAILABLE, imageUrl: 'https://placehold.co/400x250/0984e3/ffffff?text=300K+Gift+Card' },
    { title: 'Ultimate Cinema Package', description: 'The ultimate gift - covers 2 VIP tickets, combo snacks, and drinks.', value: 500000, price: 450000, status: GiftCardStatus.AVAILABLE, imageUrl: 'https://placehold.co/400x250/e17055/ffffff?text=500K+Gift+Card' },
  ];

  for (const gc of giftCardsData) {
    const existing = await prisma.giftCard.findFirst({ where: { title: gc.title } });
    if (!existing) {
      await prisma.giftCard.create({ data: gc });
    }
  }

  // ============ PRICING RULES ============
  console.log('Creating pricing rules...');
  const pricingRulesData = [
    { name: 'Standard 2D - Weekday', seatType: SeatType.STANDARD, format: RoomFormat.STANDARD2D, dayType: 'WEEKDAY' as const, price: 85000 },
    { name: 'Standard 2D - Weekend', seatType: SeatType.STANDARD, format: RoomFormat.STANDARD2D, dayType: 'WEEKEND' as const, price: 100000 },
    { name: 'VIP 2D - Weekday', seatType: SeatType.VIP, format: RoomFormat.STANDARD2D, dayType: 'WEEKDAY' as const, price: 120000 },
    { name: 'VIP 2D - Weekend', seatType: SeatType.VIP, format: RoomFormat.STANDARD2D, dayType: 'WEEKEND' as const, price: 150000 },
    { name: 'IMAX - Weekday', seatType: SeatType.STANDARD, format: RoomFormat.IMAX, dayType: 'WEEKDAY' as const, price: 150000 },
    { name: 'IMAX - Weekend', seatType: SeatType.STANDARD, format: RoomFormat.IMAX, dayType: 'WEEKEND' as const, price: 180000 },
    { name: '4DX - Weekday', seatType: SeatType.STANDARD, format: RoomFormat.FOURDX, dayType: 'WEEKDAY' as const, price: 170000 },
    { name: '4DX - Weekend', seatType: SeatType.STANDARD, format: RoomFormat.FOURDX, dayType: 'WEEKEND' as const, price: 200000 },
  ];

  for (const pr of pricingRulesData) {
    const existing = await prisma.pricingRule.findFirst({ where: { name: pr.name } });
    if (!existing) {
      await prisma.pricingRule.create({ data: pr });
    }
  }

  // ============ CAMPAIGNS ============
  console.log('Creating campaigns...');
  const campaignsData = [
    {
      title: 'Lunar New Year 2026',
      slug: 'lunar-new-year-2026',
      description: 'Celebrate Tet with special movie screenings, lucky draw prizes, and exclusive combos!',
      content: 'This Lunar New Year, CiNect brings you a festival of cinema. Enjoy special Tet-themed screenings, exclusive snack combos, and a chance to win gold coins in our lucky draw. All CiNect members earn double points on all purchases during the festival period.',
      imageUrl: 'https://placehold.co/1200x500/e74c3c/f1c40f?text=Tet+2026',
      startDate: new Date('2026-01-25'),
      endDate: new Date('2026-02-15'),
      isActive: true,
    },
    {
      title: 'Summer Blockbuster Season',
      slug: 'summer-blockbusters-2026',
      description: 'The biggest movies of the year are coming this summer. Get ready!',
      content: 'Summer 2026 promises an incredible lineup of blockbusters. From superhero epics to animated adventures, there is something for everyone. Pre-book your tickets and save up to 25% with our early bird offers.',
      imageUrl: 'https://placehold.co/1200x500/0984e3/ffffff?text=Summer+2026',
      startDate: new Date('2026-05-01'),
      endDate: new Date('2026-08-31'),
      isActive: true,
    },
  ];

  for (const c of campaignsData) {
    await prisma.campaign.upsert({
      where: { slug: c.slug },
      update: {},
      create: c,
    });
  }

  console.log('✅ Seed completed successfully!');
  console.log('');
  console.log('📌 Test accounts:');
  console.log('   Admin: admin@cinect.vn / Password@123');
  console.log('   User:  user@cinect.vn / Password@123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
