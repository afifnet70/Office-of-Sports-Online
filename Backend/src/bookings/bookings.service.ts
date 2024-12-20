import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Slot } from 'src/Slots/Slot_Entity/slot.entity';
import { Booking } from './Booking_Entity/booking.entity';
import { Sport } from 'src/sports/Sports_Entity/sports.entity'; // Import the Sport entity
import { CreateBookingDto } from './dto/booking.dto';
import { Student_Regi } from 'src/User/Student_Entity/student.entity';
import { NotificationService } from 'src/notifications/notifications.service';

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking) private bookingRepository: Repository<Booking>,
    @InjectRepository(Slot) private slotRepository: Repository<Slot>, // Inject Slot repository
    @InjectRepository(Sport) private sportRepository: Repository<Sport>, // Inject Sport repository
    @InjectRepository(Student_Regi) private studentRepository: Repository<Student_Regi>, // Inject Student repository
    private readonly notificationService:NotificationService,
  ) {}

  /**
   * Creates a booking for a specific student, sport, and slot.
   * @param CreateBookingDto - Contains the studentId, sportId, slotId, status, and payment_status.
   */
  async createBooking(createBookingDto: CreateBookingDto, studentId: number): Promise<Booking> {
    // Check if the student exists (only verifies existence without exposing data)
    const studentExists = await this.studentRepository.findOne({
      where: { id: studentId },
      select: ['id'], // Only fetch the `id` to avoid exposing other details
    });
  
    if (!studentExists) {
      throw new NotFoundException('Student not found.');
    }
  
    // Check if the sport exists
    const sport = await this.sportRepository.findOne({
      where: { id: createBookingDto.sportId },
    });
    if (!sport) {
      throw new NotFoundException('Sport not found.');
    }
  
    // Check if the slot exists
    const slot = await this.slotRepository.findOne({
      where: { id: createBookingDto.slotId },
    });
    if (!slot) {
      throw new NotFoundException('Slot not found.');
    }
  
    // Check if the student has already booked a slot on the same day for the same sport
    const existingBooking = await this.bookingRepository.findOne({
      where: {
        student: { id: studentId },
        sport: { id: createBookingDto.sportId },
        slot: { date: createBookingDto.date },
      },
    });
  
    if (existingBooking) {
      throw new BadRequestException(
        'You can only book one slot per day for each sport.',
      );
    }
  
    // Check the booking limits for the sport
    const bookingLimit = this.getSportBookingLimit(createBookingDto.sportId);
    const currentBookings = await this.bookingRepository.count({
      where: {
        sport: { id: createBookingDto.sportId },
        slot: { date: slot.date },
      },
    });
  
    if (currentBookings >= bookingLimit) {
      throw new BadRequestException(
        `Booking limit reached for this sport on ${slot.date}.`,
      );
    }
  
    // Check if the slot is already booked
    if (slot.is_booked && createBookingDto.status === 'booked') {
      throw new BadRequestException('Slot is already booked.');
    }
  
    // Create a new booking (linking by `studentId` instead of the full student entity)
    const booking = this.bookingRepository.create({
      student: { id: studentId }, // Reference the student by ID only
      sport,
      slot,
      status: createBookingDto.status,
      payment_status: createBookingDto.payment_status,
    });
  
    // If the booking status is 'booked', mark the slot as booked
    if (createBookingDto.status === 'booked') {
      slot.is_booked = true;
      await this.slotRepository.save(slot);
    }
    this.notificationService.sendNotification(
      'Booking Complete', // Title
      'Your booking has been confirmed. Details: [Booking Details]', // Message
      true // Sound (optional, defaults to true)
    );
  
    // Save the booking
    return this.bookingRepository.save(booking);
  }
  

  // Helper function to get the booking limit based on sportId
  private getSportBookingLimit(sportId: number): number {
    switch (sportId) {
      case 1: // Football
        return 20;
      case 2: // Basketball
        return 10;
      case 3: // Pool
        return 4;
      default:
        throw new BadRequestException('Sport has no defined booking limit.');
    }
  }

  /**
   * Lists all bookings for a student.
   * @param studentId - The ID of the student.
   */
  async listBookings(studentId: number) {
    const bookings = await this.bookingRepository.find({
      where: { student: { id: studentId } },
      relations: ['slot', 'student', 'sport'], // Include related entities
    });

    if (!bookings.length) {
      throw new NotFoundException('No bookings found.');
    }

    return bookings;
  }

  /**
   * Cancels and deletes a booking by ID.
   * @param bookingId - The ID of the booking to cancel and delete.
   */
  async cancelBooking(bookingId: number) {
    // Check if the booking exists in the database
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
      relations: ['slot'], // Fetch the slot to mark it as available again
    });

    // If the booking does not exist, return a message
    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }

    // Check if the associated slot exists
    const slot = booking.slot;
    if (!slot) {
      throw new NotFoundException('Slot not found for the booking.');
    }

    // Mark the slot as available again
    slot.is_booked = false;
    await this.slotRepository.save(slot);

    // Now delete the booking from the database
    await this.bookingRepository.remove(booking);

    // Return a success message after deletion and slot update
    return {
      message: 'Booking canceled and deleted successfully.',
    };
  }
}
