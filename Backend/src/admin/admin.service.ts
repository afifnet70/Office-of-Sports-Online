import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException
} from '@nestjs/common';
import { Admin } from './Admin_Entity/admin.entity';
import { UpdateAdminDto, ValidAdminDTO } from './update-admin.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coupon } from 'src/payment/Coupon_Entity/Coupon.entity';
import { CouponDTO } from 'src/Payment/Coupon_DTO/Coupon.dto';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Admin)
    private readonly adminRepository: Repository<Admin>,

    @InjectRepository(Coupon)
    private readonly couponRepository: Repository<Coupon>,
    private readonly jwtService:JwtService,
  ) {}

  async login(loginData:ValidAdminDTO,res) : Promise<{message: string,}>{
      console.log(loginData.email,loginData.password);
          const user = await this.adminRepository.findOneBy({email:loginData.email});
          if(!user){
              throw new UnauthorizedException("User not Found");
          }
          if(user.password != loginData.password){
              throw new UnauthorizedException("Invalid Password");
          }
          const payload = {
              AdminId: user.id,            // Assuming the user model has an `id` property
          };
          const Token = await this.jwtService.signAsync(payload);
          res.cookie('Admin_token',Token,{httpOnly:true});
          return{
              message: "Login Sucessfull for Admin"
          };
      }

  // Find admin by ID
  async findById(id: number): Promise<Admin> {
    const admin = await this.adminRepository.findOne({ where: { id } });
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }
    return admin;
  }

  // Get all admins
  async findAll(): Promise<Admin[]> {
    return this.adminRepository.find();
  }

  // Update admin details
  async updateAdmin(
    id: number,
    updateAdminDto: UpdateAdminDto,
  ): Promise<Admin> {
    await this.adminRepository.update(id, updateAdminDto);
    return this.findById(id);
  }

  // Change password
  async changePassword(id: number, newPassword: string): Promise<Admin> {
    const admin = await this.findById(id);
    admin.password = newPassword;
    return this.adminRepository.save(admin);
  }

  // Create a new coupon
  async createCoupon(couponDto: CouponDTO) {
    const existingCoupon = await this.couponRepository.findOne({
      where: { code: couponDto.coupon },
    });

    if (existingCoupon) {
      throw new BadRequestException('Coupon code already exists');
    }

    const newCoupon = this.couponRepository.create({
      code: couponDto.coupon,
      value: 100,
    });

    await this.couponRepository.save(newCoupon);

    return {
      message: 'Coupon created successfully',
      coupon: newCoupon,
    };
  }

  // Get coupon by code
  async getCouponByCode(code: string) {
    const coupon = await this.couponRepository.findOne({ where: { code } });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    return coupon;
  }
}
